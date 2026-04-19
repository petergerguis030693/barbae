const { query } = require('../config/db');

let hasAddressColumns = null;

async function ensureCustomerAddressColumns() {
  if (hasAddressColumns === true) {
    return;
  }

  const requiredColumns = [
    { name: 'street', ddl: 'ALTER TABLE customers ADD COLUMN street VARCHAR(190) NULL AFTER phone' },
    { name: 'postal_code', ddl: 'ALTER TABLE customers ADD COLUMN postal_code VARCHAR(20) NULL AFTER street' },
    { name: 'city', ddl: 'ALTER TABLE customers ADD COLUMN city VARCHAR(120) NULL AFTER postal_code' },
    { name: 'company_name', ddl: 'ALTER TABLE customers ADD COLUMN company_name VARCHAR(190) NULL AFTER city' },
    { name: 'uid_number', ddl: 'ALTER TABLE customers ADD COLUMN uid_number VARCHAR(60) NULL AFTER company_name' },
    { name: 'newsletter_opt_in', ddl: 'ALTER TABLE customers ADD COLUMN newsletter_opt_in TINYINT(1) NOT NULL DEFAULT 0 AFTER uid_number' }
  ];

  for (const column of requiredColumns) {
    const rows = await query(`SHOW COLUMNS FROM customers LIKE '${column.name}'`);
    if (!rows.length) {
      await query(column.ddl);
    }
  }

  hasAddressColumns = true;
}

async function listCustomers() {
  await ensureCustomerAddressColumns();
  return query(
    `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.street, c.postal_code, c.city, c.company_name, c.uid_number, c.newsletter_opt_in, c.created_at,
            COUNT(o.id) AS order_count,
            COALESCE(SUM(o.total_amount), 0) AS lifetime_value
     FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id
     GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone, c.street, c.postal_code, c.city, c.company_name, c.uid_number, c.newsletter_opt_in, c.created_at
     ORDER BY c.created_at DESC`
  );
}

async function getCustomerById(customerId) {
  await ensureCustomerAddressColumns();
  const rows = await query(
    `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.street, c.postal_code, c.city, c.company_name, c.uid_number, c.newsletter_opt_in, c.created_at,
            COUNT(o.id) AS order_count,
            COALESCE(SUM(o.total_amount), 0) AS lifetime_value
     FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id
     WHERE c.id = ?
     GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone, c.street, c.postal_code, c.city, c.company_name, c.uid_number, c.newsletter_opt_in, c.created_at
     LIMIT 1`,
    [customerId]
  );
  return rows[0] || null;
}

async function listCustomerOrders(customerId) {
  return query(
    `SELECT o.id, o.order_number, o.status, o.total_amount, o.currency, o.created_at,
            COUNT(oi.id) AS item_count,
            COALESCE(SUM(oi.quantity), 0) AS total_quantity
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.customer_id = ?
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [customerId]
  );
}

async function getCustomerOrderDetailByNumber(customerId, orderNumber) {
  const rows = await query(
    `SELECT o.id, o.order_number, o.status, o.total_amount, o.currency, o.created_at,
            o.subtotal_net, o.tax_amount, o.shipping_amount,
            c.first_name, c.last_name, c.email, c.phone, c.street, c.postal_code, c.city, c.company_name, c.uid_number
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.customer_id = ? AND o.order_number = ?
     LIMIT 1`,
    [customerId, String(orderNumber || '')]
  );

  const order = rows[0] || null;
  if (!order) return null;

  const items = await query(
    `SELECT oi.product_id, oi.quantity, oi.unit_price, oi.total_price, oi.option_summary, oi.selected_options_json, p.title, p.slug, p.featured_image
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?
     ORDER BY oi.id ASC`,
    [order.id]
  );

  return { order, items };
}

async function updateCustomer(customerId, payload) {
  await ensureCustomerAddressColumns();
  const { first_name, last_name, email, phone, street, postal_code, city, company_name, uid_number, newsletter_opt_in } = payload;
  await query(
    `UPDATE customers
     SET first_name = ?, last_name = ?, email = ?, phone = ?, street = ?, postal_code = ?, city = ?, company_name = ?, uid_number = ?, newsletter_opt_in = COALESCE(?, newsletter_opt_in)
     WHERE id = ?`,
    [
      first_name,
      last_name,
      email,
      phone || null,
      street || null,
      postal_code || null,
      city || null,
      company_name || null,
      uid_number || null,
      newsletter_opt_in === undefined ? null : Number(newsletter_opt_in ? 1 : 0),
      customerId
    ]
  );
}

async function deleteCustomerById(customerId) {
  await ensureCustomerAddressColumns();
  const id = Number(customerId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('invalid-customer');
  }

  const [orderCountRow] = await query('SELECT COUNT(*) AS count FROM orders WHERE customer_id = ?', [id]);
  if (Number(orderCountRow?.count || 0) > 0) {
    throw new Error('customer-has-orders');
  }

  const cartRows = await query('SELECT id FROM customer_carts WHERE customer_id = ?', [id]);
  if (cartRows.length) {
    const cartIds = cartRows.map((row) => Number(row.id)).filter((x) => Number.isFinite(x) && x > 0);
    if (cartIds.length) {
      const placeholders = cartIds.map(() => '?').join(',');
      await query(`DELETE FROM customer_cart_items WHERE cart_id IN (${placeholders})`, cartIds);
    }
    await query('DELETE FROM customer_carts WHERE customer_id = ?', [id]);
  }

  await query('DELETE FROM customer_messages WHERE customer_id = ?', [id]);
  await query('DELETE FROM customers WHERE id = ?', [id]);
}

module.exports = { listCustomers, getCustomerById, listCustomerOrders, getCustomerOrderDetailByNumber, updateCustomer, deleteCustomerById };
