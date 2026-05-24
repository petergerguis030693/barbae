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

  const email = process.argv[2] || 'peter.gerguis@gmail.com';

  const [rows] = await conn.query(
    `SELECT
       id,
       email,
       first_name,
       last_name,
       (password_hash IS NOT NULL) AS has_password,
       email_verified_at,
       (email_verification_token_hash IS NOT NULL) AS has_pending_verification_token,
       email_verification_expires_at,
       (password_reset_token_hash IS NOT NULL) AS has_pending_reset_token,
       password_reset_expires_at,
       created_at
     FROM customers
     WHERE LOWER(email) = LOWER(?)`,
    [email]
  );

  console.log('Customer rows for', email, ':');
  console.log(JSON.stringify(rows, null, 2));

  const [logs] = await conn.query(
    `SELECT id, recipient, subject, status, provider_message, related_type, related_id, created_at
     FROM email_logs
     WHERE LOWER(recipient) = LOWER(?)
     ORDER BY created_at DESC, id DESC
     LIMIT 20`,
    [email]
  );

  console.log('\nLast email logs to', email, ':');
  console.log(JSON.stringify(logs, null, 2));

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
