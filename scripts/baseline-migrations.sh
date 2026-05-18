#!/usr/bin/env bash
# ============================================================
# ONE-TIME: Baseline production migration tracking (COMPLETED)
# ============================================================
#
# This script was run once on 2026-05-17 to bootstrap the versioned
# migration system. It is kept for documentation purposes only.
#
# What happened:
#   - Production was built using `drizzle-kit push --force` (no tracking)
#   - We generated 0000_modern_violations.sql as a full-schema snapshot
#   - drizzle-orm stores migrations in `drizzle.__drizzle_migrations`
#     (NOT `public.__drizzle_migrations` — this was the root cause of
#     the initial failure)
#   - We inserted a baseline record with the SHA256 hash of the 0000
#     SQL file content and the folderMillis timestamp from _journal.json
#   - The old `public.__drizzle_migrations` table (created by a previous
#     failed attempt) was dropped
#
# Key facts for future reference:
#   - drizzle-orm uses schema: `drizzle`, table: `__drizzle_migrations`
#   - Hash = SHA256 of the .sql file content (not the tag name)
#   - Migration ordering uses `created_at` (folderMillis from _journal.json)
#   - To generate new migrations: npx drizzle-kit generate
#   - To apply: npx drizzle-kit migrate (or deploy.sh step 4)
#
# DO NOT RUN THIS AGAIN.
# ============================================================
echo "This baseline has already been applied. See script comments for details."
exit 0
