#!/usr/bin/env bash
# Applies every migration to a throwaway local PostgreSQL database and runs the
# voting-engine tests in supabase/tests. Needs psql and a running PostgreSQL;
# set PGURL to point somewhere other than the default local server.
set -euo pipefail
cd "$(dirname "$0")/.."

PGURL="${PGURL:-postgresql://postgres:postgres@localhost:5432}"
DB="hfc_voting_test_$$"

psql "$PGURL/postgres" -qc "create database $DB"
trap 'psql "$PGURL/postgres" -qc "drop database if exists $DB" >/dev/null' EXIT

run() { psql "$PGURL/$DB" -v ON_ERROR_STOP=1 -q -f "$1"; }

run supabase/tests/supabase_stubs.sql
for f in supabase/migrations/[0-9]*.sql; do
  run "$f"
  # Data that must exist before the voting-rules migration converts it.
  if [[ "$(basename "$f")" == 014_* ]]; then
    run supabase/tests/fixtures_before_015.sql
  fi
done
run supabase/tests/voting_engine.test.sql
