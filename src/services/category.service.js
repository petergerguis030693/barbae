const { query } = require('../config/db');

let schemaChecked = null;

async function ensureCategoryColumns() {
  if (schemaChecked === true) {
    return;
  }

  const requiredColumns = [
    { name: 'image_path', ddl: 'ALTER TABLE categories ADD COLUMN image_path VARCHAR(255) NULL AFTER slug' },
    { name: 'description', ddl: 'ALTER TABLE categories ADD COLUMN description TEXT NULL AFTER image_path' },
    { name: 'seo_text', ddl: 'ALTER TABLE categories ADD COLUMN seo_text MEDIUMTEXT NULL AFTER description' },
    { name: 'is_coming_soon', ddl: 'ALTER TABLE categories ADD COLUMN is_coming_soon TINYINT(1) NOT NULL DEFAULT 0 AFTER seo_text' }
  ];

  for (const column of requiredColumns) {
    const rows = await query(`SHOW COLUMNS FROM categories LIKE '${column.name}'`);
    if (!rows.length) {
      await query(column.ddl);
      if (column.name === 'is_coming_soon') {
        await query("UPDATE categories SET is_coming_soon = 1 WHERE LOWER(name) = 'beauty'");
      }
    }
  }

  schemaChecked = true;
}

async function listCategories() {
  await ensureCategoryColumns();
  return query(
    `SELECT c.id, c.name, c.slug, c.image_path, c.description, c.seo_text, c.is_coming_soon, c.parent_id, p.name AS parent_name, c.created_at
     FROM categories c
     LEFT JOIN categories p ON p.id = c.parent_id
     ORDER BY c.name ASC`
  );
}

async function setCategoryComingSoon(id, isComingSoon) {
  await ensureCategoryColumns();
  await query('UPDATE categories SET is_coming_soon = ? WHERE id = ?', [isComingSoon ? 1 : 0, id]);
}

async function createCategory(payload) {
  await ensureCategoryColumns();
  const { name, slug, parent_id, image_path, description, seo_text } = payload;
  await query('INSERT INTO categories (name, slug, image_path, description, seo_text, parent_id) VALUES (?, ?, ?, ?, ?, ?)', [
    name,
    slug || null,
    image_path || null,
    description || null,
    seo_text || null,
    parent_id || null
  ]);
}

async function updateCategory(id, payload) {
  await ensureCategoryColumns();
  const { name, slug, parent_id, image_path, description, seo_text, remove_image } = payload;

  if (remove_image) {
    await query('UPDATE categories SET name = ?, slug = ?, image_path = NULL, description = ?, seo_text = ?, parent_id = ? WHERE id = ?', [
      name,
      slug || null,
      description || null,
      seo_text || null,
      parent_id || null,
      id
    ]);
    return;
  }

  if (image_path) {
    await query('UPDATE categories SET name = ?, slug = ?, image_path = ?, description = ?, seo_text = ?, parent_id = ? WHERE id = ?', [
      name,
      slug || null,
      image_path,
      description || null,
      seo_text || null,
      parent_id || null,
      id
    ]);
  } else {
    await query('UPDATE categories SET name = ?, slug = ?, description = ?, seo_text = ?, parent_id = ? WHERE id = ?', [
      name,
      slug || null,
      description || null,
      seo_text || null,
      parent_id || null,
      id
    ]);
  }
}

async function deleteCategory(id) {
  await query('DELETE FROM categories WHERE id = ?', [id]);
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory, setCategoryComingSoon };
