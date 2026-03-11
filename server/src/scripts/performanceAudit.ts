import { query } from '../db/index.js';

async function auditPerformance() {
  console.log('═══ MESSIGN PERFORMANCE AUDIT ═══\n');

  // 1. Check if pg_stat_statements is available
  console.log('── Slow Queries (if pg_stat_statements available) ──');
  try {
    const slow = await query(`
      SELECT
        LEFT(query, 100) as query_preview,
        calls,
        ROUND(total_exec_time::numeric / calls, 2) as avg_time_ms,
        ROUND(total_exec_time::numeric, 2) as total_time_ms,
        rows
      FROM pg_stat_statements
      WHERE calls > 10
      ORDER BY total_exec_time DESC
      LIMIT 20
    `);
    (slow.rows as { query_preview: string; calls: string; avg_time_ms: string; total_time_ms: string; rows: string }[]).forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.avg_time_ms}ms avg, ${r.calls} calls] ${r.query_preview}`);
    });
  } catch {
    console.log('  pg_stat_statements not available — enable it in postgresql.conf for production monitoring');
  }

  // 2. Check table sizes
  console.log('\n── Table Sizes ──');
  const sizes = await query(`
    SELECT
      schemaname || '.' || relname as table_name,
      pg_size_pretty(pg_total_relation_size(relid)) as total_size,
      pg_size_pretty(pg_relation_size(relid)) as data_size,
      n_live_tup as row_count
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 30
  `);
  (sizes.rows as { table_name: string; total_size: string; data_size: string; row_count: string }[]).forEach((r) => {
    console.log(`  ${r.table_name}: ${r.total_size} (${r.row_count} rows)`);
  });

  // 3. Check missing indexes
  console.log('\n── Potentially Missing Indexes ──');
  const missing = await query(`
    SELECT
      schemaname || '.' || relname as table_name,
      seq_scan,
      seq_tup_read,
      idx_scan,
      n_live_tup as row_count
    FROM pg_stat_user_tables
    WHERE seq_scan > 100
      AND n_live_tup > 1000
      AND (idx_scan IS NULL OR idx_scan < seq_scan * 0.5)
    ORDER BY seq_tup_read DESC
    LIMIT 10
  `);
  (missing.rows as { table_name: string; seq_scan: string; seq_tup_read: string; idx_scan: string | null; row_count: string }[]).forEach((r) => {
    console.log(`  ⚠ ${r.table_name}: ${r.seq_scan} seq scans vs ${r.idx_scan || 0} idx scans (${r.row_count} rows)`);
  });

  // 4. Check index usage
  console.log('\n── Unused Indexes (candidates for removal) ──');
  const unused = await query(`
    SELECT
      schemaname || '.' || relname as table_name,
      indexrelname as index_name,
      pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
      idx_scan
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
      AND pg_relation_size(indexrelid) > 8192
    ORDER BY pg_relation_size(indexrelid) DESC
    LIMIT 10
  `);
  (unused.rows as { table_name: string; index_name: string; index_size: string; idx_scan: string }[]).forEach((r) => {
    console.log(`  ${r.index_name} on ${r.table_name}: ${r.index_size} (0 scans)`);
  });

  // 5. Check materialized view sizes and freshness
  console.log('\n── Materialized Views ──');
  try {
    const mvs = await query(`
      SELECT
        schemaname || '.' || matviewname as view_name,
        pg_size_pretty(pg_total_relation_size((schemaname || '.' || matviewname)::regclass)) as size
      FROM pg_matviews
      ORDER BY matviewname
    `);
    (mvs.rows as { view_name: string; size: string }[]).forEach((r) => {
      console.log(`  ${r.view_name}: ${r.size}`);
    });
    if (mvs.rows.length === 0) {
      console.log('  (none)');
    }
  } catch {
    console.log('  (unable to query pg_matviews)');
  }

  // 6. Connection pool status
  console.log('\n── Active Connections ──');
  const conns = await query(`
    SELECT
      state,
      COUNT(*) as count,
      MAX(EXTRACT(EPOCH FROM (NOW() - state_change)))::int as max_idle_seconds
    FROM pg_stat_activity
    WHERE datname = current_database()
    GROUP BY state
  `);
  (conns.rows as { state: string | null; count: string; max_idle_seconds: string | null }[]).forEach((r) => {
    console.log(`  ${r.state || 'null'}: ${r.count} connections (max idle: ${r.max_idle_seconds}s)`);
  });

  console.log('\n═══ AUDIT COMPLETE ═══');
}

auditPerformance().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
