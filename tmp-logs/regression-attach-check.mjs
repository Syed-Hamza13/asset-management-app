// Regression proof for the duplicate-field fix, using a ROLLED-BACK transaction
// so nothing is committed to the production database.
import { pool } from '../server/src/config/db.js';
import { attachCommonFields } from '../server/src/modules/commonForms/service.js';

const TYPE_ID = 31; // 'pencil', owned by another user

const [types] = await pool.execute(
  'SELECT at.id, at.name, at.owner_user_id, u.email AS owner_email FROM asset_types at JOIN users u ON u.id = at.owner_user_id WHERE at.id = ?',
  [TYPE_ID],
);
const type = types[0];
const [admins] = await pool.execute(
  "SELECT id, email, role FROM users WHERE email = 'techteam@eklavya.in' LIMIT 1",
);
const admin = admins[0];

const adminActor = { id: admin.id, email: admin.email, role: admin.role, isAdmin: true, permissions: [] };
const ownerActor = { id: type.owner_user_id, email: type.owner_email, role: 'user', isAdmin: false, permissions: [] };

const conn = await pool.getConnection();
const snapshot = async () => {
  const [r] = await conn.execute(
    'SELECT COUNT(*) AS c, GROUP_CONCAT(field_definition_id ORDER BY id) AS ids FROM asset_type_fields WHERE asset_type_id = ?',
    [TYPE_ID],
  );
  return r[0];
};

try {
  await conn.beginTransaction();
  const before = await snapshot();
  await attachCommonFields(adminActor, TYPE_ID, conn);
  const withAdmin = await snapshot();
  await conn.rollback();
  console.log(`type #${TYPE_ID} ${type.name} owner=${ownerActor.email}`);
  console.log(`rows before                 : ${before.c} [${before.ids}]`);
  console.log(`attachCommonFields(ADMIN)   : ${withAdmin.c} [${withAdmin.ids}]  -> +${withAdmin.c - before.c} rows (rolled back)`);

  await conn.beginTransaction();
  await attachCommonFields(ownerActor, TYPE_ID, conn);
  const withOwner = await snapshot();
  await conn.rollback();
  console.log(`attachCommonFields(OWNER)   : ${withOwner.c} [${withOwner.ids}]  -> +${withOwner.c - before.c} rows (rolled back)`);

  const [after] = await pool.execute(
    'SELECT COUNT(*) AS c FROM asset_type_fields WHERE asset_type_id = ?',
    [TYPE_ID],
  );
  console.log(`committed rows after test   : ${after[0].c} (must equal ${before.c})`);
} finally {
  conn.release();
  await pool.end();
}
