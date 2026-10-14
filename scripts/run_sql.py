"""Execute Oracle SQL scripts as F1_CHAMP. Splits on '/' lines and on ';'."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")


def split_sql(text: str) -> list[str]:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    chunks: list[str] = []
    buf: list[str] = []
    for line in text.splitlines():
        if line.strip() == "/":
            piece = "\n".join(buf).strip()
            if piece:
                chunks.append(piece)
            buf = []
        else:
            stripped = line.lstrip()
            if stripped.startswith("--"):
                continue
            buf.append(line)
    tail = "\n".join(buf).strip()
    if tail:
        chunks.append(tail)

    statements: list[str] = []
    plsql = re.compile(
        r"(?:^|\n)\s*(BEGIN|DECLARE|CREATE\s+OR\s+REPLACE\s+(?:PROCEDURE|FUNCTION|TRIGGER|PACKAGE))\b",
        re.I,
    )

    def split_by_semicolon(text: str) -> list[str]:
        out: list[str] = []
        acc: list[str] = []
        for line in text.splitlines():
            acc.append(line)
            joined = "\n".join(acc)
            if joined.rstrip().endswith(";"):
                stmt = joined.rstrip().rstrip(";").strip()
                if stmt:
                    out.append(stmt)
                acc = []
        leftover = "\n".join(acc).strip().rstrip(";")
        if leftover:
            out.append(leftover)
        return out

    for chunk in chunks:
        match = plsql.search(chunk)
        if match:
            before = chunk[: match.start()].strip()
            body = chunk[match.start() :].strip()
            if before:
                statements.extend(split_by_semicolon(before))
            if body:
                statements.append(body)
            continue
        statements.extend(split_by_semicolon(chunk))
    return statements


def connect():
    import oracledb

    user = os.environ.get("ORACLE_USER")
    password = os.environ.get("ORACLE_PASSWORD")
    dsn = os.environ.get("ORACLE_DSN")
    if not user or not password or not dsn:
        raise SystemExit(
            "Missing ORACLE_USER / ORACLE_PASSWORD / ORACLE_DSN. Copy .env.example to .env."
        )
    if os.environ.get("ORACLE_THICK_MODE", "").lower() == "true":
        oracledb.init_oracle_client()
    return oracledb.connect(user=user, password=password, dsn=dsn)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: python scripts/run_sql.py database/01_schema.sql")
        return 2
    path = Path(argv[1])
    if not path.is_file():
        path = ROOT / argv[1]
    sql = path.read_text(encoding="utf-8")
    statements = split_sql(sql)
    print(f"Executing {len(statements)} statements from {path}")
    conn = connect()
    try:
        cur = conn.cursor()
        for i, stmt in enumerate(statements, 1):
            preview = " ".join(stmt.split())[:90]
            try:
                cur.execute(stmt)
                print(f"  OK {i}: {preview}")
            except Exception as exc:  # noqa: BLE001
                print(f"  FAIL {i}: {preview}\n    {exc}")
                conn.rollback()
                return 1
        conn.commit()
    finally:
        conn.close()
    print("Committed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
