#!/usr/bin/env bash
# Applies every Netlify Database migration to a throwaway local PostgreSQL
# database and runs the voting-engine tests in tests/db. Needs psql and a
# running PostgreSQL; set PGURL to point somewhere other than the default
# local server.
set -euo pipefail
cd "$(dirname "$0")/.."

PGURL="${PGURL:-postgresql://postgres:postgres@localhost:5432}"
DB="hfc_voting_test_$$"

psql "$PGURL/postgres" -qc "create database $DB"
trap 'psql "$PGURL/postgres" -qc "drop database if exists $DB" >/dev/null' EXIT

run() { psql "$PGURL/$DB" -v ON_ERROR_STOP=1 -q -f "$1"; }

for f in netlify/database/migrations/[0-9]*.sql; do
  run "$f"
done
run tests/db/fixtures.sql
run tests/db/voting_engine.test.sql
