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

  const slug = process.argv[2] || 'mirave';

  const [rows] = await conn.query(
    `SELECT id, title, slug, sku, is_active, category_id
     FROM products
     WHERE slug = ? OR slug LIKE ? OR title LIKE ? OR sku LIKE ?
     LIMIT 20`,
    [slug, `%${slug}%`, `%${slug}%`, `%${slug}%`]
  );
  console.log('Matches for', slug, ':');
  console.log(JSON.stringify(rows, null, 2));

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
