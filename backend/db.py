from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
import time
from typing import Any, Iterator

import oracledb

from config import oracle_config, viewer_oracle_config

_pool: oracledb.ConnectionPool | None = None
_viewer_pool: oracledb.ConnectionPool | None = None


def _init_client_if_needed() -> None:
    cfg = oracle_config()
    if cfg["thick"].lower() == "true":
        oracledb.init_oracle_client()


def get_pool() -> oracledb.ConnectionPool:
    global _pool
    if _pool is None:
        cfg = oracle_config()
        if not cfg["user"] or not cfg["password"] or not cfg["dsn"]:
            raise RuntimeError(
                "Oracle credentials are not configured. Copy .env.example to .env and set ORACLE_USER, ORACLE_PASSWORD, ORACLE_DSN."
            )
        _init_client_if_needed()
        _pool = oracledb.create_pool(
            user=cfg["user"],
            password=cfg["password"],
            dsn=cfg["dsn"],
            min=1,
            max=4,
            increment=1,
        )
    return _pool


def get_viewer_pool() -> oracledb.ConnectionPool:
    global _viewer_pool
    if _viewer_pool is None:
        cfg = viewer_oracle_config()
        if not cfg["user"] or not cfg["password"] or not cfg["dsn"]:
            raise RuntimeError(
                "Oracle credentials are not configured. Copy .env.example to .env and set ORACLE_USER, ORACLE_PASSWORD, ORACLE_DSN."
            )
        _init_client_if_needed()
        _viewer_pool = oracledb.create_pool(
            user=cfg["user"],
            password=cfg["password"],
            dsn=cfg["dsn"],
            min=1,
            max=4,
            increment=1,
        )
    return _viewer_pool


@contextmanager
def connection() -> Iterator[oracledb.Connection]:
    pool = get_pool()
    conn = pool.acquire()
    try:
        yield conn
    finally:
        pool.release(conn)


@contextmanager
def viewer_connection() -> Iterator[oracledb.Connection]:
    pool = get_viewer_pool()
    conn = pool.acquire()
    cfg = viewer_oracle_config()
    try:
        if cfg.get("is_dedicated_viewer"):
            cur = conn.cursor()
            cur.execute("ALTER SESSION SET CURRENT_SCHEMA = F1_CHAMP")
            cur.close()
        yield conn
    finally:
        pool.release(conn)


def run_console_query(sql: str, max_rows: int = 200, timeout_ms: int = 10000) -> tuple[list[str], list[dict[str, Any]], float]:
    """
    SAFETY EXCEPTION: This function executes user-supplied SQL in the analytics console.
    It connects through a dedicated viewer pool (f1_viewer read-only credentials when configured),
    sets call_timeout on the connection, and caps returned rows at max_rows.
    """
    t0 = time.perf_counter()
    with viewer_connection() as conn:
        conn.call_timeout = timeout_ms
        cur = conn.cursor()
        cur.execute(sql)
        cols = [d[0].lower() for d in cur.description] if cur.description else []
        raw_rows = cur.fetchmany(max_rows)
        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        dict_rows = [{cols[i]: _convert(v) for i, v in enumerate(r)} for r in raw_rows]
        return cols, dict_rows, duration_ms


def _convert(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def rows_as_dicts(cursor: oracledb.Cursor) -> list[dict[str, Any]]:
    if cursor.description is None:
        return []
    cols = [d[0].lower() for d in cursor.description]
    return [{cols[i]: _convert(v) for i, v in enumerate(row)} for row in cursor]


def query(sql: str, params: dict | list | None = None) -> list[dict[str, Any]]:
    with connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, params or {})
        return rows_as_dicts(cur)


def execute(sql: str, params: dict | None = None, *, commit: bool = True) -> int:
    with connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, params or {})
        if commit:
            conn.commit()
        return cur.rowcount or 0


def call_cursor(proc_name: str, season: int) -> list[dict[str, Any]]:
    with connection() as conn:
        cur = conn.cursor()
        ref = conn.cursor()
        cur.callproc(proc_name, [season, ref])
        return rows_as_dicts(ref)


def ping() -> dict[str, Any]:
    with connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 AS ok FROM dual")
        dual = rows_as_dicts(cur)
        try:
            cur.execute("SELECT COUNT(*) AS race_results FROM race_result")
            counts = rows_as_dicts(cur)[0]
        except oracledb.DatabaseError:
            counts = {"race_results": None, "schema_ready": False}
        else:
            counts["schema_ready"] = True
        return {"dual": dual[0]["ok"] == 1, **counts}
