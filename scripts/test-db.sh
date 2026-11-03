#!/usr/bin/env bash
# Applies the database migrations (netlify/database/migrations) to a throwaway
# local PostgreSQL database and runs the voting-engine tests. Needs psql and a
# running PostgreSQL; set PGURL to point somewhere other than the default
# local server.
set -euo pipefail
cd "$(dirname "$0")/.."

PGURL="${PGURL:-postgresql://postgres:postgres@localhost:5432}"
DB="hfc_voting_test_$$"

psql "$PGURL/postgres" -qc "create database $DB"
trap 'psql "$PGURL/postgres" -qc "drop database if exists $DB" >/dev/null' EXIT

run() { psql "$PGURL/$DB" -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null; }

for f in netlify/database/migrations/[0-9]*.sql; do
  run "$f"
done
# Running the migrations again must change nothing (Netlify may retry them).
for f in netlify/database/migrations/[0-9]*.sql; do
  run "$f"
done
run netlify/database/tests/fixtures.sql
psql "$PGURL/$DB" -v ON_ERROR_STOP=1 -q -f netlify/database/tests/voting_engine.test.sql
