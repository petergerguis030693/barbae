const { query } = require('../config/db');

let hasProductOptionColumns = null;

async function ensureProductOptionColumns() {
  if (hasProductOptionColumns === true) {
    return;
  }

  const requiredColumns = [
    { name: 'weight_grams', ddl: 'ALTER TABLE products ADD COLUMN weight_grams INT UNSIGNED NOT NULL DEFAULT 0 AFTER stock' },
    { name: 'has_color_options', ddl: 'ALTER TABLE products ADD COLUMN has_color_options TINYINT(1) NOT NULL DEFAULT 0 AFTER stock' },
    { name: 'has_size_options', ddl: 'ALTER TABLE products ADD COLUMN has_size_options TINYINT(1) NOT NULL DEFAULT 0 AFTER has_color_options' },
    { name: 'color_stock_json', ddl: 'ALTER TABLE products ADD COLUMN color_stock_json TEXT NULL AFTER has_size_options' },
    { name: 'has_personalization_options', ddl: 'ALTER TABLE products ADD COLUMN has_personalization_options TINYINT(1) NOT NULL DEFAULT 0 AFTER color_stock_json' },
    { name: 'personalization_type', ddl: "ALTER TABLE products ADD COLUMN personalization_type ENUM('none','initials','name','date') NOT NULL DEFAULT 'none' AFTER has_personalization_options" }
  ];

  for (const column of requiredColumns) {
    const rows = await query(`SHOW COLUMNS FROM products LIKE '${column.name}'`);
    if (!rows.length) {
      await query(column.ddl);
    }
  }

  hasProductOptionColumns = true;
}

async function listProducts() {
  await ensureProductOptionColumns();
  return query(
    `SELECT p.id, p.category_id, p.title, p.slug, p.sku, p.price, p.stock, p.weight_grams,
            p.has_color_options, p.has_size_options, p.color_stock_json,
            p.has_personalization_options, p.personalization_type,
            p.featured_image, p.is_active, p.is_bestseller,
            p.seo_title, p.seo_description,
            c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.created_at DESC`
  );
}

async function listCategoriesForProducts() {
  return query('SELECT id, name FROM categories ORDER BY name ASC');
}

async function getProductsByIds(ids = []) {
  const normalized = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  if (!normalized.length) {
    return [];
  }

  const placeholders = normalized.map(() => '?').join(',');
  return query(
    `SELECT id, category_id, title, slug, sku, price, stock, weight_grams, featured_image, is_active, has_color_options, has_size_options,
            color_stock_json, has_personalization_options, personalization_type
     FROM products
     WHERE id IN (${placeholders})`,
    normalized
  );
}

async function getProductById(id) {
  await ensureProductOptionColumns();
  const rows = await query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function getProductDetailByRef(ref) {
  await ensureProductOptionColumns();
  const raw = String(ref || '').trim();
  const idMatch = raw.match(/^id-(\d+)$/i) || raw.match(/^(\d+)$/);

  if (idMatch) {
    const rows = await query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.parent_id AS category_parent_id
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?
       LIMIT 1`,
      [Number(idMatch[1])]
    );
    return rows[0] || null;
  }

  const rows = await query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.parent_id AS category_parent_id
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE LOWER(p.slug) = LOWER(?)
     LIMIT 1`,
    [raw]
  );
  return rows[0] || null;
}

async function listProductGallery(productId) {
  return query(
    'SELECT id, image_path, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC',
    [productId]
  );
}

async function createProduct(payload) {
  await ensureProductOptionColumns();
  const {
    category_id,
    title,
    slug,
    sku,
    description,
    price,
    stock,
    weight_grams,
    has_color_options,
    has_size_options,
    color_stock_json,
    has_personalization_options,
    personalization_type,
    featured_image,
    gallery = [],
    is_active,
    is_bestseller,
    seo_title,
    seo_description,
    seo_text,
    focus_keyword
  } = payload;

  const result = await query(
    `INSERT INTO products (
      category_id, title, slug, sku, description, price, stock, weight_grams, has_color_options, has_size_options, color_stock_json, has_personalization_options, personalization_type, featured_image, is_active,
      is_bestseller, seo_title, seo_description, seo_text, focus_keyword
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      category_id || null,
      title,
      slug || null,
      sku || null,
      description || null,
      Number(price || 0),
      Number(stock || 0),
      Math.max(0, Number(weight_grams || 0)),
      Number(has_color_options ?? 0),
      Number(has_size_options ?? 0),
      color_stock_json || null,
      Number(has_personalization_options ?? 0),
      ['none', 'initials', 'name', 'date'].includes(personalization_type) ? personalization_type : 'none',
      featured_image || null,
      Number(is_active ?? 1),
      Number(is_bestseller ?? 0),
      seo_title || null,
      seo_description || null,
      seo_text || null,
      focus_keyword || null
    ]
  );

  const productId = result.insertId;
  for (let i = 0; i < gallery.length; i += 1) {
    await query('INSERT INTO product_images (product_id, image_path, sort_order) VALUES (?, ?, ?)', [productId, gallery[i], i + 1]);
  }
}

async function updateProduct(id, payload) {
  await ensureProductOptionColumns();
  const {
    category_id,
    title,
    slug,
    sku,
    description,
    price,
    stock,
    weight_grams,
    has_color_options,
    has_size_options,
    color_stock_json,
    has_personalization_options,
    personalization_type,
    featured_image,
    is_active,
    is_bestseller,
    gallery = [],
    seo_title,
    seo_description,
    seo_text,
    focus_keyword
  } = payload;

  if (featured_image) {
    await query(
      `UPDATE products
       SET category_id = ?, title = ?, slug = ?, sku = ?, description = ?, price = ?, stock = ?, weight_grams = ?, has_color_options = ?, has_size_options = ?, color_stock_json = ?, has_personalization_options = ?, personalization_type = ?, featured_image = ?, is_active = ?,
           is_bestseller = ?, seo_title = ?, seo_description = ?, seo_text = ?, focus_keyword = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        category_id || null,
        title,
        slug || null,
        sku || null,
        description || null,
        Number(price || 0),
        Number(stock || 0),
        Math.max(0, Number(weight_grams || 0)),
        Number(has_color_options ?? 0),
        Number(has_size_options ?? 0),
        color_stock_json || null,
        Number(has_personalization_options ?? 0),
        ['none', 'initials', 'name', 'date'].includes(personalization_type) ? personalization_type : 'none',
        featured_image,
        Number(is_active),
        Number(is_bestseller),
        seo_title || null,
        seo_description || null,
        seo_text || null,
        focus_keyword || null,
        id
      ]
    );
  } else {
    await query(
      `UPDATE products
       SET category_id = ?, title = ?, slug = ?, sku = ?, description = ?, price = ?, stock = ?, weight_grams = ?, has_color_options = ?, has_size_options = ?, color_stock_json = ?, has_personalization_options = ?, personalization_type = ?, is_active = ?,
           is_bestseller = ?, seo_title = ?, seo_description = ?, seo_text = ?, focus_keyword = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        category_id || null,
        title,
        slug || null,
        sku || null,
        description || null,
        Number(price || 0),
        Number(stock || 0),
        Math.max(0, Number(weight_grams || 0)),
        Number(has_color_options ?? 0),
        Number(has_size_options ?? 0),
        color_stock_json || null,
        Number(has_personalization_options ?? 0),
        ['none', 'initials', 'name', 'date'].includes(personalization_type) ? personalization_type : 'none',
        Number(is_active),
        Number(is_bestseller),
        seo_title || null,
        seo_description || null,
        seo_text || null,
        focus_keyword || null,
        id
      ]
    );
  }

  if (gallery.length) {
    const maxSortRows = await query('SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM product_images WHERE product_id = ?', [id]);
    let sort = maxSortRows[0].maxSort;

    for (const imagePath of gallery) {
      sort += 1;
      await query('INSERT INTO product_images (product_id, image_path, sort_order) VALUES (?, ?, ?)', [id, imagePath, sort]);
    }
  }
}

async function deleteProduct(id) {
  await query('DELETE FROM product_images WHERE product_id = ?', [id]);
  await query('DELETE FROM products WHERE id = ?', [id]);
}

async function listInventory() {
  return query(
    `SELECT id, title, sku, stock,
            CASE WHEN stock <= 0 THEN 'out'
                 WHEN stock <= 5 THEN 'low'
                 ELSE 'ok'
            END AS stock_state
     FROM products
     ORDER BY stock ASC, title ASC`
  );
}

async function setBestseller(productId, isBestseller) {
  await query('UPDATE products SET is_bestseller = ?, updated_at = NOW() WHERE id = ?', [Number(isBestseller), productId]);
}

module.exports = {
  listProducts,
  listCategoriesForProducts,
  getProductsByIds,
  getProductById,
  getProductDetailByRef,
  listProductGallery,
  createProduct,
  updateProduct,
  setBestseller,
  deleteProduct,
  listInventory
};
