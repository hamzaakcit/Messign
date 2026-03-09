/**
 * Diagnose missing employees - run with: npx tsx server/src/scripts/diagnoseEmployees.ts
 */
import 'dotenv/config';
import { pool } from '../db/index.js';

async function main() {
  const client = await pool.connect();
  try {
    const org = await client.query(
      `SELECT id, name, slug FROM organizations WHERE slug = 'messign' LIMIT 1`
    );
    const orgRow = org.rows[0];
    if (!orgRow) {
      console.log('❌ Organization "messign" not found');
      return;
    }
    const orgId = orgRow.id;
    console.log('✅ Organization:', orgRow.name, '(id:', orgId, ')');

    const allRu = await client.query(
      `SELECT id, auth_user_id, email, full_name, organization_id FROM reimbursement_users ORDER BY full_name`
    );
    console.log('\n📋 All reimbursement_users:', allRu.rows.length);
    const inOrg = allRu.rows.filter((r) => r.organization_id === orgId);
    const notInOrg = allRu.rows.filter((r) => r.organization_id !== orgId);
    console.log('   - In messign org:', inOrg.length);
    console.log('   - Other/wrong org:', notInOrg.length);

    if (notInOrg.length > 0) {
      console.log('\n⚠️  Employees NOT in messign org (these would be "missing"):');
      for (const r of notInOrg) {
        console.log(`   - ${r.full_name} (${r.email}) auth_user_id=${r.auth_user_id}`);
      }
    }

    const eaCount = await client.query(`SELECT COUNT(*) FROM employee_auth`);
    console.log('\n📋 employee_auth rows:', eaCount.rows[0]?.count);

    // Check for auth_user_id mismatch: ea has X, ru has Y for same email
    const mismatched = await client.query(
      `SELECT ea.auth_user_id AS ea_auth_id, ea.email, ru.auth_user_id AS ru_auth_id, ru.full_name
       FROM employee_auth ea
       JOIN reimbursement_users ru ON LOWER(ru.email) = LOWER(ea.email) AND ru.organization_id = $1
       WHERE ea.auth_user_id IS DISTINCT FROM ru.auth_user_id`,
      [orgId]
    );
    if (mismatched.rows.length > 0) {
      console.log('\n⚠️  auth_user_id mismatch (ea vs ru for same email):');
      for (const r of mismatched.rows) {
        console.log(`   - ${r.full_name} (${r.email}): ea=${r.ea_auth_id} vs ru=${r.ru_auth_id}`);
      }
    }

    console.log('\n✅ Employees that WOULD show in Employee Management (getEmployeesAsUsers):');
    for (const r of inOrg) {
      console.log(`   - ${r.full_name} (${r.email})`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
