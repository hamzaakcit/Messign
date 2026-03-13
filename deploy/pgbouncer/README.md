# PgBouncer Setup for Messign

Transaction pooling to prevent PostgreSQL connection exhaustion. Each Node.js process opens its own connections; PgBouncer multiplexes them to a smaller pool of backend connections.

## RLS Compatibility

**Use `pool_mode = transaction`** — required for our Row-Level Security (RLS) tenant context:

- We use `set_config('app.current_tenant', $1, true)` inside each transaction
- **Transaction mode**: Each `BEGIN`…`COMMIT` runs on one backend; `set_config` persists for that transaction ✓
- **Statement mode**: Would run each statement on a different backend; tenant context would not persist ✗
- **Session mode**: Works but uses more connections; transaction mode is more efficient ✓

## Deployment

### Railway

Use the [PgBouncer plugin](https://docs.railway.app/databases/postgresql#connection-pooling). It uses transaction mode by default. Point `DATABASE_URL` to the PgBouncer URL (usually port 6432).

### Self-hosted

1. Install PgBouncer: `apt install pgbouncer` (Debian/Ubuntu) or equivalent
2. Copy `pgbouncer.ini` to `/etc/pgbouncer/pgbouncer.ini`
3. Create `userlist.txt` from `userlist.txt.example` with your DB user and md5 password hash
4. Update `[databases]` in `pgbouncer.ini` with your PostgreSQL host/port/dbname
5. Start: `systemctl start pgbouncer`

### App configuration

Set `PGBOUNCER_URL` to point at PgBouncer (port 6432). The app prefers it over `DATABASE_URL` when present:

```bash
# Via PgBouncer (recommended for production)
PGBOUNCER_URL=postgresql://user:pass@localhost:6432/messign_production

# Or override DATABASE_URL directly
DATABASE_URL=postgresql://user:pass@localhost:6432/messign_production
```

When `PGBOUNCER_URL` is set, the Node pool uses `max: 10` (PgBouncer handles the real pooling). Otherwise `max: 20` for direct PostgreSQL connections.
