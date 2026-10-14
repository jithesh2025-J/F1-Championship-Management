"""Conservative HTTP client for the Jolpica-F1 (Ergast-compatible) API."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests

BASE_URL = "https://api.jolpi.ca/ergast/f1"
DEFAULT_TIMEOUT = 30
MIN_INTERVAL_SEC = 0.6
MAX_RETRIES = 5

logger = logging.getLogger("jolpica")


class JolpicaError(RuntimeError):
    pass


class JolpicaClient:
    def __init__(self, cache_dir: Path, session: requests.Session | None = None) -> None:
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session = session or requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "F1-Championship-Management-CollegeProject/1.0 (educational)",
                "Accept": "application/json",
            }
        )
        self._last_request = 0.0

    def _cache_path(self, rel: str) -> Path:
        safe = rel.strip("/").replace("?", "_").replace("&", "_").replace("=", "-")
        if not safe.endswith(".json"):
            safe += ".json"
        path = self.cache_dir / safe
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _pace(self) -> None:
        elapsed = time.monotonic() - self._last_request
        if elapsed < MIN_INTERVAL_SEC:
            time.sleep(MIN_INTERVAL_SEC - elapsed)

    def fetch_json(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        *,
        allow_404: bool = False,
        use_cache: bool = True,
    ) -> dict[str, Any] | None:
        params = params or {}
        rel = path.lstrip("/")
        if params:
            rel = f"{rel}?{urlencode(params)}"
        cache_path = self._cache_path(rel)
        url = f"{BASE_URL}/{path.lstrip('/')}"
        if params:
            url = f"{url}?{urlencode(params)}"

        if use_cache and cache_path.exists():
            logger.info("cache hit %s", cache_path)
            with cache_path.open(encoding="utf-8") as fh:
                payload = json.load(fh)
            if payload.get("_http_status") == 404:
                return None
            return payload

        delay = 1.0
        last_error = None
        for attempt in range(1, MAX_RETRIES + 1):
            self._pace()
            try:
                logger.info("GET %s (attempt %s)", url, attempt)
                response = self.session.get(url, timeout=DEFAULT_TIMEOUT)
                self._last_request = time.monotonic()
            except requests.RequestException as exc:
                last_error = exc
                logger.warning("network error: %s", exc)
                time.sleep(delay)
                delay *= 2
                continue

            if response.status_code == 404 and allow_404:
                cache_path.write_text(
                    json.dumps({"_http_status": 404, "_source_url": url}, indent=2),
                    encoding="utf-8",
                )
                return None

            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else delay
                wait = min(max(wait, 2.0), 60.0)
                logger.warning("HTTP 429 — waiting %.1fs", wait)
                time.sleep(wait)
                delay = min(delay * 2, 60.0)
                last_error = JolpicaError(f"429 Too Many Requests for {url}")
                continue

            if 500 <= response.status_code < 600:
                logger.warning("HTTP %s for %s", response.status_code, url)
                time.sleep(delay)
                delay *= 2
                last_error = JolpicaError(f"HTTP {response.status_code} for {url}")
                continue

            if response.status_code != 200:
                raise JolpicaError(f"HTTP {response.status_code} for {url}: {response.text[:300]}")

            try:
                payload = response.json()
            except json.JSONDecodeError as exc:
                raise JolpicaError(f"Invalid JSON from {url}") from exc

            payload["_source_url"] = url
            cache_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            return payload

        raise JolpicaError(f"Failed after {MAX_RETRIES} attempts: {url} ({last_error})")

    def fetch_paginated(self, path: str, list_path: tuple[str, ...], *, allow_404: bool = False) -> list[Any]:
        """Follow Ergast limit/offset pagination. list_path is MRData nested keys to the list."""
        collected: list[Any] = []
        limit = 100
        offset = 0
        total = None
        while True:
            payload = self.fetch_json(path, {"limit": limit, "offset": offset}, allow_404=allow_404)
            if payload is None:
                return collected
            mr = payload.get("MRData") or {}
            try:
                total = int(mr.get("total", 0))
            except (TypeError, ValueError) as exc:
                raise JolpicaError(f"Missing total in {payload.get('_source_url')}") from exc
            node: Any = mr
            for key in list_path:
                if node is None:
                    break
                node = node.get(key) if isinstance(node, dict) else None
            if node is None:
                node = []
            if not isinstance(node, list):
                raise JolpicaError(f"Expected list at {list_path} for {path}")
            collected.extend(node)
            offset += limit
            if offset >= total:
                break
        return collected
