# Task 7 concurrency test

This test commits synthetic fixtures and creates database extensions. Run it only in a disposable local Goat Supabase instance created for this test. Never run it against a shared development database, staging, production, or a remote project. Recreate the disposable instance before each run so the fixtures are absent.

The procedure below assumes the isolated instance uses project ID `goat-task7-contract-isolated`, its database container is named `supabase_db_goat-task7-contract-isolated`, and its configuration and accepted migrations live in `/tmp/goat-task7-contract`. Check the project and workdir labels before proceeding. The authorization marker is scoped to this PostgreSQL cluster and a fresh invocation token. The script also requires a local Unix socket and the test administrator role.

From the repository root, in Bash:

```bash
set -euo pipefail
container=supabase_db_goat-task7-contract-isolated
project=$(docker inspect --format '{{ index .Config.Labels "com.supabase.cli.project" }}' "$container")
workdir=$(docker inspect --format '{{ index .Config.Labels "com.supabase.cli.workdir" }}' "$container")
test "$project" = goat-task7-contract-isolated
test "$workdir" = /tmp/goat-task7-contract

# This resets only the identified disposable instance. It reapplies local migrations.
supabase db reset --local --no-seed --workdir "$workdir"
export GOAT_TASK7_AUTH_TOKEN="$(openssl rand -hex 32)"
docker exec -i -e GOAT_TASK7_AUTH_TOKEN "$container" psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres <<'SQL'
\set ON_ERROR_STOP on
\getenv task7_token GOAT_TASK7_AUTH_TOKEN
BEGIN;
CREATE SCHEMA task7_test_authorization;
REVOKE ALL ON SCHEMA task7_test_authorization FROM PUBLIC;
CREATE TABLE task7_test_authorization.disposable_instance (token text NOT NULL, system_identifier numeric NOT NULL);
REVOKE ALL ON task7_test_authorization.disposable_instance FROM PUBLIC;
INSERT INTO task7_test_authorization.disposable_instance
SELECT :'task7_token', system_identifier FROM pg_control_system();
COMMIT;
SQL

docker exec -i -e GOAT_TASK7_AUTH_TOKEN "$container" psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres < supabase/concurrency/task7_contact_concurrency.sql
unset GOAT_TASK7_AUTH_TOKEN
```

The script aborts before fixture writes unless its token matches the database marker and cluster identifier. It waits until the second connection is blocked on a lock before committing the first, then reports four pgTAP assertions. A SQL error stops `psql` immediately. The test leaves its synthetic fixtures in the disposable database; destroy the disposable instance when it is no longer needed.
