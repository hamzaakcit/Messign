-- Give the engage role a login. Run once per environment as an admin, after migration 111 created the role.
-- Put the resulting connection string in ENGAGE_DATABASE_URL. Never reuse the legacy DATABASE_URL role.
-- Replace YOUR_STRONG_PASSWORD before running; do not commit the real value.

ALTER ROLE messign_engage LOGIN PASSWORD 'YOUR_STRONG_PASSWORD' NOSUPERUSER NOBYPASSRLS;

SELECT rolname, rolcanlogin, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'messign_engage';
-- Expected: rolcanlogin=true, rolsuper=false, rolbypassrls=false
