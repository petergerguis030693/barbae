require('dotenv').config();
const mysql = require('mysql2/promise');

function cleanSlug(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/^products\//i, '')
    .replace(/^product\//i, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [rows] = await conn.query(
    `SELECT id, title, slug FROM products WHERE slug LIKE '/%' OR slug LIKE '%/%' OR slug LIKE '% %'`
  );

  for (const row of rows) {
    const next = cleanSlug(row.slug);
    if (next && next !== row.slug) {
      console.log(`Fixing product ${row.id} (${row.title}): "${row.slug}" -> "${next}"`);
      await conn.query('UPDATE products SET slug = ? WHERE id = ?', [next, row.id]);
    }
  }

  console.log('Done. Checked', rows.length, 'rows.');
  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
