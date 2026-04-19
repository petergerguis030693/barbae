const bcrypt = require('bcrypt');
const { query, pool } = require('../config/db');
require('dotenv').config();

async function seed() {
  const name = process.env.SEED_ADMIN_NAME || 'Super Admin';
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';

  const passwordHash = await bcrypt.hash(password, 12);

  await query(
    `INSERT INTO admins (name, email, password_hash, is_active)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       password_hash = VALUES(password_hash),
       is_active = 1`,
    [name, email, passwordHash]
  );

  console.log(`Admin-User bereitgestellt: ${email}`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
