const { query } = require('../config/db');

let hasProductOptionColumns = null;
let hasFocusKeywordTextColumn = null;

async function ensureProductOptionColumns() {
  if (hasProductOptionColumns === true) {
    return;
  }

  const requiredColumns = [
    { name: 'weight_grams', ddl: 'ALTER TABLE products ADD COLUMN weight_grams INT UNSIGNED NOT NULL DEFAULT 0 AFTER stock' },
    { name: 'has_color_options', ddl: 'ALTER TABLE products ADD COLUMN has_color_options TINYINT(1) NOT NULL DEFAULT 0 AFTER stock' },
    { name: 'has_size_options', ddl: 'ALTER TABLE products ADD COLUMN has_size_options TINYINT(1) NOT NULL DEFAULT 0 AFTER has_color_options' },
    { name: 'color_stock_json', ddl: 'ALTER TABLE products ADD COLUMN color_stock_json TEXT NULL AFTER has_size_options' },
    { name: 'size_stock_json', ddl: 'ALTER TABLE products ADD COLUMN size_stock_json TEXT NULL AFTER color_stock_json' },
    { name: 'has_personalization_options', ddl: 'ALTER TABLE products ADD COLUMN has_personalization_options TINYINT(1) NOT NULL DEFAULT 0 AFTER color_stock_json' },
    { name: 'personalization_type', ddl: "ALTER TABLE products ADD COLUMN personalization_type ENUM('none','initials','name','date') NOT NULL DEFAULT 'none' AFTER has_personalization_options" },
    { name: 'personalization_price', ddl: 'ALTER TABLE products ADD COLUMN personalization_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER personalization_type' },
    { name: 'personalization_fields_json', ddl: 'ALTER TABLE products ADD COLUMN personalization_fields_json TEXT NULL AFTER personalization_price' },
    { name: 'stock_initial', ddl: 'ALTER TABLE products ADD COLUMN stock_initial INT NOT NULL DEFAULT 0 AFTER stock' },
    { name: 'low_stock_alert_sent_at', ddl: 'ALTER TABLE products ADD COLUMN low_stock_alert_sent_at DATETIME NULL AFTER stock_initial' }
  ];

  let stockInitialAdded = false;
  for (const column of requiredColumns) {
    const rows = await query(`SHOW COLUMNS FROM products LIKE '${column.name}'`);
    if (!rows.length) {
      await query(column.ddl);
      if (column.name === 'stock_initial') {
        stockInitialAdded = true;
      }
    }
  }

  if (stockInitialAdded) {
    await query('UPDATE products SET stock_initial = stock WHERE stock_initial = 0 AND stock > 0');
  }

  hasProductOptionColumns = true;
}

async function ensureProductFocusKeywordColumn() {
  if (hasFocusKeywordTextColumn === true) {
    return;
  }

  const rows = await query("SHOW COLUMNS FROM products LIKE 'focus_keyword'");
  if (!rows.length) {
    hasFocusKeywordTextColumn = true;
    return;
  }

  const columnType = String(rows[0].Type || '').toLowerCase();
  if (columnType !== 'text') {
    await query('ALTER TABLE products MODIFY COLUMN focus_keyword TEXT NULL');
  }

  hasFocusKeywordTextColumn = true;
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
  await ensureProductFocusKeywordColumn();
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
    size_stock_json,
    has_personalization_options,
    personalization_type,
    personalization_price,
    personalization_fields_json,
    featured_image,
    gallery = [],
    is_active,
    is_bestseller,
    seo_title,
    seo_description,
    seo_text,
    focus_keyword
  } = payload;

  const stockValue = Math.max(0, Number(stock || 0));

  const result = await query(
    `INSERT INTO products (
      category_id, title, slug, sku, description, price, stock, stock_initial, weight_grams, has_color_options, has_size_options, color_stock_json, size_stock_json, has_personalization_options, personalization_type, personalization_price, personalization_fields_json, featured_image, is_active,
      is_bestseller, seo_title, seo_description, seo_text, focus_keyword
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      category_id || null,
      title,
      slug || null,
      sku || null,
      description || null,
      Number(price || 0),
      stockValue,
      stockValue,
      Math.max(0, Number(weight_grams || 0)),
      Number(has_color_options ?? 0),
      Number(has_size_options ?? 0),
      color_stock_json || null,
      size_stock_json || null,
      Number(has_personalization_options ?? 0),
      ['none', 'initials', 'name', 'date'].includes(personalization_type) ? personalization_type : 'none',
      Math.max(0, Number(personalization_price || 0)),
      personalization_fields_json || null,
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
  await ensureProductFocusKeywordColumn();
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
    size_stock_json,
    has_personalization_options,
    personalization_type,
    personalization_price,
    personalization_fields_json,
    featured_image,
    is_active,
    is_bestseller,
    gallery = [],
    seo_title,
    seo_description,
    seo_text,
    focus_keyword
  } = payload;

  const stockValue = Math.max(0, Number(stock || 0));
  const personalizationPriceValue = Math.max(0, Number(personalization_price || 0));

  // Track high watermark and reset low-stock alert when admin restocks above 20%
  const currentRows = await query('SELECT stock, stock_initial FROM products WHERE id = ? LIMIT 1', [id]);
  const previousInitial = Number(currentRows[0]?.stock_initial || 0);
  const nextInitial = Math.max(previousInitial, stockValue);
  const aboveThreshold = nextInitial > 0 && stockValue >= Math.ceil(nextInitial * 0.2);
  const resetAlertSql = aboveThreshold ? ', low_stock_alert_sent_at = NULL' : '';

  if (featured_image) {
    await query(
      `UPDATE products
       SET category_id = ?, title = ?, slug = ?, sku = ?, description = ?, price = ?, stock = ?, stock_initial = ?, weight_grams = ?, has_color_options = ?, has_size_options = ?, color_stock_json = ?, size_stock_json = ?, has_personalization_options = ?, personalization_type = ?, personalization_price = ?, personalization_fields_json = ?, featured_image = ?, is_active = ?,
           is_bestseller = ?, seo_title = ?, seo_description = ?, seo_text = ?, focus_keyword = ?, updated_at = NOW()${resetAlertSql}
       WHERE id = ?`,
      [
        category_id || null,
        title,
        slug || null,
        sku || null,
        description || null,
        Number(price || 0),
        stockValue,
        nextInitial,
        Math.max(0, Number(weight_grams || 0)),
        Number(has_color_options ?? 0),
        Number(has_size_options ?? 0),
        color_stock_json || null,
        size_stock_json || null,
        Number(has_personalization_options ?? 0),
        ['none', 'initials', 'name', 'date'].includes(personalization_type) ? personalization_type : 'none',
        personalizationPriceValue,
        personalization_fields_json || null,
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
       SET category_id = ?, title = ?, slug = ?, sku = ?, description = ?, price = ?, stock = ?, stock_initial = ?, weight_grams = ?, has_color_options = ?, has_size_options = ?, color_stock_json = ?, size_stock_json = ?, has_personalization_options = ?, personalization_type = ?, personalization_price = ?, personalization_fields_json = ?, is_active = ?,
           is_bestseller = ?, seo_title = ?, seo_description = ?, seo_text = ?, focus_keyword = ?, updated_at = NOW()${resetAlertSql}
       WHERE id = ?`,
      [
        category_id || null,
        title,
        slug || null,
        sku || null,
        description || null,
        Number(price || 0),
        stockValue,
        nextInitial,
        Math.max(0, Number(weight_grams || 0)),
        Number(has_color_options ?? 0),
        Number(has_size_options ?? 0),
        color_stock_json || null,
        size_stock_json || null,
        Number(has_personalization_options ?? 0),
        ['none', 'initials', 'name', 'date'].includes(personalization_type) ? personalization_type : 'none',
        personalizationPriceValue,
        personalization_fields_json || null,
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

function safeParseStockJson(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch (_error) {
    return {};
  }
}

async function decrementStockForOrder(items = []) {
  await ensureProductOptionColumns();

  const lowStockProducts = [];

  for (const item of items) {
    const productId = Number(item?.productId);
    const qty = Math.max(0, Number(item?.qty || 0));
    if (!productId || !qty) continue;

    const rows = await query(
      'SELECT id, title, sku, stock, stock_initial, color_stock_json, size_stock_json, low_stock_alert_sent_at FROM products WHERE id = ? LIMIT 1',
      [productId]
    );
    const product = rows[0];
    if (!product) continue;

    const selected = (() => {
      try {
        return JSON.parse(String(item?.selectedOptionsJson || '{}')) || {};
      } catch (_error) {
        return {};
      }
    })();
    const color = String(selected.color || '').trim();
    const size = String(selected.size || '').trim();

    const colorStock = safeParseStockJson(product.color_stock_json);
    const sizeStock = safeParseStockJson(product.size_stock_json);
    let colorStockChanged = false;
    let sizeStockChanged = false;

    if (color && Object.prototype.hasOwnProperty.call(colorStock, color)) {
      colorStock[color] = Math.max(0, Number(colorStock[color] || 0) - qty);
      colorStockChanged = true;
    }
    if (size && Object.prototype.hasOwnProperty.call(sizeStock, size)) {
      sizeStock[size] = Math.max(0, Number(sizeStock[size] || 0) - qty);
      sizeStockChanged = true;
    }

    const newStock = Math.max(0, Number(product.stock || 0) - qty);

    await query(
      `UPDATE products
       SET stock = ?, color_stock_json = ?, size_stock_json = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        newStock,
        colorStockChanged ? JSON.stringify(colorStock) : product.color_stock_json,
        sizeStockChanged ? JSON.stringify(sizeStock) : product.size_stock_json,
        productId
      ]
    );

    const initial = Number(product.stock_initial || 0);
    const threshold = initial > 0 ? Math.ceil(initial * 0.2) : 0;
    const wasAboveThreshold = Number(product.stock || 0) > threshold;
    const isBelowThreshold = newStock <= threshold;
    const alreadyAlerted = Boolean(product.low_stock_alert_sent_at);

    if (initial > 0 && wasAboveThreshold && isBelowThreshold && !alreadyAlerted) {
      await query('UPDATE products SET low_stock_alert_sent_at = NOW() WHERE id = ?', [productId]);
      lowStockProducts.push({
        id: productId,
        title: product.title,
        sku: product.sku,
        stock: newStock,
        stockInitial: initial,
        threshold,
        percent: initial > 0 ? Math.round((newStock / initial) * 100) : 0
      });
    }
  }

  return { lowStockProducts };
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
  listInventory,
  decrementStockForOrder
};
