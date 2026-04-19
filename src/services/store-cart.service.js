const { query } = require('../config/db');

let cartTablesReady = false;

function normalizeCartItems(items = []) {
  const merged = new Map();

  for (const raw of Array.isArray(items) ? items : []) {
    const productId = Number(raw.productId || raw.product_id);
    const qty = Math.max(0, Math.floor(Number(raw.qty || raw.quantity || 0)));
    const selectedOptions =
      raw.selectedOptions && typeof raw.selectedOptions === 'object' && !Array.isArray(raw.selectedOptions)
        ? Object.keys(raw.selectedOptions)
            .sort()
            .reduce((acc, key) => {
              const value = String(raw.selectedOptions[key] || '').trim();
              if (value) acc[key] = value;
              return acc;
            }, {})
        : {};
    const optionKey = String(raw.optionKey || raw.option_key || Object.entries(selectedOptions).map(([k, v]) => `${k}:${v}`).join('|') || '');
    if (!Number.isFinite(productId) || productId <= 0 || qty <= 0) continue;
    const lineKey = `${productId}::${optionKey}`;
    const existing = merged.get(lineKey);
    if (existing) {
      existing.qty += qty;
    } else {
      merged.set(lineKey, { productId, qty, optionKey, selectedOptions });
    }
  }

  return Array.from(merged.values()).map((item) => ({ ...item }));
}

async function ensureCartTables() {
  if (cartTablesReady) return;

  await query(
    `CREATE TABLE IF NOT EXISTS customer_carts (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      customer_id INT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_customer_cart_customer_id (customer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS customer_cart_items (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      cart_id INT UNSIGNED NOT NULL,
      product_id INT UNSIGNED NOT NULL,
      option_key VARCHAR(191) NOT NULL DEFAULT '',
      selected_options_json TEXT NULL,
      quantity INT UNSIGNED NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_customer_cart_item (cart_id, product_id, option_key),
      KEY idx_customer_cart_items_cart_id (cart_id),
      KEY idx_customer_cart_items_product_id (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  const hasOptionKey = await query("SHOW COLUMNS FROM customer_cart_items LIKE 'option_key'");
  if (!hasOptionKey.length) {
    await query("ALTER TABLE customer_cart_items ADD COLUMN option_key VARCHAR(191) NOT NULL DEFAULT '' AFTER product_id");
  }
  const hasSelectedOptions = await query("SHOW COLUMNS FROM customer_cart_items LIKE 'selected_options_json'");
  if (!hasSelectedOptions.length) {
    await query("ALTER TABLE customer_cart_items ADD COLUMN selected_options_json TEXT NULL AFTER option_key");
  }
  const oldUnique = await query("SHOW INDEX FROM customer_cart_items WHERE Key_name = 'uniq_customer_cart_item'");
  if (oldUnique.length && oldUnique.length < 3) {
    await query('ALTER TABLE customer_cart_items DROP INDEX uniq_customer_cart_item');
    await query('ALTER TABLE customer_cart_items ADD UNIQUE KEY uniq_customer_cart_item (cart_id, product_id, option_key)');
  }

  cartTablesReady = true;
}

async function getOrCreateCustomerCartId(customerId) {
  await ensureCartTables();
  const normalizedCustomerId = Number(customerId);
  if (!Number.isFinite(normalizedCustomerId) || normalizedCustomerId <= 0) {
    throw new Error('invalid-customer-id');
  }

  await query('INSERT IGNORE INTO customer_carts (customer_id) VALUES (?)', [normalizedCustomerId]);
  const rows = await query('SELECT id FROM customer_carts WHERE customer_id = ? LIMIT 1', [normalizedCustomerId]);
  if (!rows[0]) throw new Error('cart-not-found');
  return Number(rows[0].id);
}

async function listCustomerCart(customerId) {
  const cartId = await getOrCreateCustomerCartId(customerId);
  const rows = await query(
    `SELECT cci.product_id, cci.quantity, p.title, p.price, p.featured_image, p.is_active, p.weight_grams
            , cci.option_key, cci.selected_options_json
     FROM customer_cart_items cci
     LEFT JOIN products p ON p.id = cci.product_id
     WHERE cci.cart_id = ?
     ORDER BY cci.id ASC`,
    [cartId]
  );

  const validRows = rows.filter((row) => row && Number(row.product_id) > 0 && Number(row.quantity) > 0 && Number(row.is_active) === 1);

  // Cleanup stale/inactive products automatically.
  const invalidProductIds = rows
    .filter((row) => !row || Number(row.product_id) <= 0 || Number(row.quantity) <= 0 || Number(row.is_active) !== 1)
    .map((row) => Number(row?.product_id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (invalidProductIds.length) {
    const placeholders = invalidProductIds.map(() => '?').join(',');
    await query(`DELETE FROM customer_cart_items WHERE cart_id = ? AND product_id IN (${placeholders})`, [cartId, ...invalidProductIds]);
  }

  return validRows.map((row) => ({
    productId: Number(row.product_id),
    title: row.title || 'Produkt',
    price: Number(row.price || 0),
    qty: Math.max(1, Number(row.quantity || 1)),
    image: row.featured_image ? (String(row.featured_image).startsWith('/') ? row.featured_image : `/${row.featured_image}`) : '',
    weightGrams: Math.max(0, Number(row.weight_grams || 0)),
    optionKey: String(row.option_key || ''),
    selectedOptions: (() => {
      try {
        const parsed = JSON.parse(String(row.selected_options_json || '{}'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch (_error) {
        return {};
      }
    })()
  }));
}

async function setCustomerCartItems(customerId, items = []) {
  const cartId = await getOrCreateCustomerCartId(customerId);
  const normalized = normalizeCartItems(items);

  await query('DELETE FROM customer_cart_items WHERE cart_id = ?', [cartId]);
  for (const item of normalized) {
    await query(
      'INSERT INTO customer_cart_items (cart_id, product_id, option_key, selected_options_json, quantity) VALUES (?, ?, ?, ?, ?)',
      [cartId, item.productId, item.optionKey || '', JSON.stringify(item.selectedOptions || {}), item.qty]
    );
  }

  await query('UPDATE customer_carts SET updated_at = NOW() WHERE id = ?', [cartId]);
  return listCustomerCart(customerId);
}

async function mergeCustomerCartItems(customerId, items = []) {
  const cartId = await getOrCreateCustomerCartId(customerId);
  const normalized = normalizeCartItems(items);

  for (const item of normalized) {
    await query(
      `INSERT INTO customer_cart_items (cart_id, product_id, option_key, selected_options_json, quantity)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity), selected_options_json = VALUES(selected_options_json), updated_at = NOW()`,
      [cartId, item.productId, item.optionKey || '', JSON.stringify(item.selectedOptions || {}), item.qty]
    );
  }

  await query('UPDATE customer_carts SET updated_at = NOW() WHERE id = ?', [cartId]);
  return listCustomerCart(customerId);
}

async function clearCustomerCart(customerId) {
  const cartId = await getOrCreateCustomerCartId(customerId);
  await query('DELETE FROM customer_cart_items WHERE cart_id = ?', [cartId]);
  await query('UPDATE customer_carts SET updated_at = NOW() WHERE id = ?', [cartId]);
}

module.exports = {
  normalizeCartItems,
  listCustomerCart,
  setCustomerCartItems,
  mergeCustomerCartItems,
  clearCustomerCart
};
