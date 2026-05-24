require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [before] = await conn.query(
    `SELECT id, email, email_verified_at, created_at
     FROM customers
     WHERE password_hash IS NOT NULL AND email_verified_at IS NULL`
  );
  console.log('Customers to fix:', before);

  const [result] = await conn.query(
    `UPDATE customers
     SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
     WHERE password_hash IS NOT NULL AND email_verified_at IS NULL`
  );
  console.log('Updated rows:', result.affectedRows);

  const [after] = await conn.query(
    `SELECT id, email, email_verified_at FROM customers WHERE id IN (?)`,
    [before.map((r) => r.id).length ? before.map((r) => r.id) : [0]]
  );
  console.log('After:', after);

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
