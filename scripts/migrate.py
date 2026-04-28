#!/usr/bin/env python3
"""
Drizzle migration runner for sqld (libSQL).

Reads .sql migration files, splits on --> statement-breakpoint,
and executes them as a single batched pipeline request.

Usage:
    python3 scripts/migrate.py <sqld_url> <migrations_dir>

Example:
    python3 scripts/migrate.py http://172.18.0.3:8080 ./drizzle
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error


def sqld_pipeline(url: str, statements: list[str]) -> list[dict]:
    """Execute a batch of SQL statements via sqld's /v2/pipeline endpoint."""
    requests = [{"type": "execute", "stmt": {"sql": s}} for s in statements]
    payload = json.dumps({"requests": requests}).encode("utf-8")

    req = urllib.request.Request(
        f"{url}/v2/pipeline",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())["results"]
    except urllib.error.URLError as e:
        print(f"  ✗ Connection error: {e}", file=sys.stderr)
        sys.exit(1)


def split_migration(sql_text: str) -> list[str]:
    """Split a Drizzle migration file into individual SQL statements.
    
    Handles both formats:
        - Inline:  ALTER TABLE ... ADD col;--> statement-breakpoint
        - Newline: CREATE TABLE (...);\n--> statement-breakpoint
    """
    # Split on the breakpoint marker
    parts = re.split(r'-->\s*statement-breakpoint', sql_text)

    statements = []
    for part in parts:
        # Remove comment lines, strip whitespace
        lines = [l for l in part.strip().splitlines() if not l.strip().startswith('--')]
        cleaned = '\n'.join(lines).strip()
        # Remove trailing semicolons (sqld doesn't need them)
        cleaned = cleaned.rstrip(';').strip()
        if cleaned:
            statements.append(cleaned)

    return statements


def get_applied_hashes(url: str) -> set[str]:
    """Get the set of already-applied migration hashes from the DB."""
    # Ensure migration tracking table exists
    sqld_pipeline(url, [
        "CREATE TABLE IF NOT EXISTS __drizzle_migrations "
        "(id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)"
    ])

    results = sqld_pipeline(url, ["SELECT hash FROM __drizzle_migrations ORDER BY id"])
    rows = results[0]["response"]["result"]["rows"]
    return {row[0]["value"] for row in rows}


def apply_migration(url: str, filename: str, statements: list[str]) -> bool:
    """Apply a single migration: execute all statements + record the hash atomically.
    
    Returns True if applied, False if skipped due to all-already-exists.
    """
    # Add the hash recording as the final statement in the batch
    record_sql = (
        f"INSERT INTO __drizzle_migrations (hash, created_at) "
        f"VALUES ('{filename}', {int(time.time() * 1000)})"
    )
    all_stmts = statements + [record_sql]

    results = sqld_pipeline(url, all_stmts)

    # Check each result
    had_real_work = False
    for i, result in enumerate(results):
        stmt_preview = all_stmts[i][:80].replace('\n', ' ')

        if result["type"] == "error":
            error_msg = result.get("error", {}).get("message", str(result))

            # Allow "already exists" / "duplicate column" — idempotent
            if re.search(r'already exists|duplicate column', error_msg, re.IGNORECASE):
                print(f"    ⚠ Skipped (exists): {stmt_preview}")
                continue

            # Allow duplicate hash recording (if we're re-running)
            if "UNIQUE constraint failed" in error_msg and "__drizzle_migrations" in all_stmts[i]:
                print(f"    ⚠ Hash already recorded")
                continue

            # Real error — abort
            print(f"    ✗ FAILED: {stmt_preview}", file=sys.stderr)
            print(f"      Error: {error_msg}", file=sys.stderr)
            sys.exit(1)
        else:
            if i < len(statements):  # Don't count the hash recording
                had_real_work = True

    return had_real_work


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <sqld_url> <migrations_dir>", file=sys.stderr)
        sys.exit(1)

    sqld_url = sys.argv[1].rstrip("/")
    migrations_dir = sys.argv[2]

    # Discover migration files
    migration_files = sorted(
        f for f in os.listdir(migrations_dir)
        if f.endswith(".sql") and f[0].isdigit()
    )

    if not migration_files:
        print("No migration files found.")
        return

    # Get already-applied hashes
    applied = get_applied_hashes(sqld_url)
    print(f"Found {len(migration_files)} migration files, {len(applied)} already applied")

    applied_count = 0
    skipped_count = 0

    for mf in migration_files:
        filename = mf.replace(".sql", "")

        if filename in applied:
            skipped_count += 1
            continue

        filepath = os.path.join(migrations_dir, mf)
        with open(filepath, "r") as f:
            sql_text = f.read()

        statements = split_migration(sql_text)
        if not statements:
            print(f"  ⚠ {filename}: empty migration, skipping")
            skipped_count += 1
            continue

        print(f"  → Applying {filename} ({len(statements)} statements)...")
        apply_migration(sqld_url, filename, statements)
        applied_count += 1
        print(f"  ✓ Applied {filename}")

    print(f"\nDone: {applied_count} applied, {skipped_count} skipped")


if __name__ == "__main__":
    main()
