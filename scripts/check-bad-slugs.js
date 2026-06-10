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

  const [rows] = await conn.query(
    `SELECT id, title, slug FROM products
     WHERE slug LIKE '/%' OR slug LIKE '%/%' OR slug LIKE '% %'
     ORDER BY id`
  );
  console.log('Products with suspicious slugs:');
  console.log(JSON.stringify(rows, null, 2));

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
