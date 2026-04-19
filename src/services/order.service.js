const { query } = require('../config/db');

let hasCustomerAddressColumns = null;
let hasOrderFulfillmentColumn = null;

async function ensureCustomerAddressColumns() {
  if (hasCustomerAddressColumns === true) {
    return;
  }

  const requiredColumns = [
    { name: 'street', ddl: 'ALTER TABLE customers ADD COLUMN street VARCHAR(190) NULL AFTER phone' },
    { name: 'postal_code', ddl: 'ALTER TABLE customers ADD COLUMN postal_code VARCHAR(20) NULL AFTER street' },
    { name: 'city', ddl: 'ALTER TABLE customers ADD COLUMN city VARCHAR(120) NULL AFTER postal_code' },
    { name: 'company_name', ddl: 'ALTER TABLE customers ADD COLUMN company_name VARCHAR(190) NULL AFTER city' },
    { name: 'uid_number', ddl: 'ALTER TABLE customers ADD COLUMN uid_number VARCHAR(60) NULL AFTER company_name' }
  ];

  for (const column of requiredColumns) {
    const rows = await query(`SHOW COLUMNS FROM customers LIKE '${column.name}'`);
    if (!rows.length) {
      await query(column.ddl);
    }
  }

  hasCustomerAddressColumns = true;
}

async function ensureOrderFulfillmentColumn() {
  if (hasOrderFulfillmentColumn === true) return;
  const rows = await query("SHOW COLUMNS FROM orders LIKE 'fulfillment_method'");
  if (!rows.length) {
    await query("ALTER TABLE orders ADD COLUMN fulfillment_method VARCHAR(30) NOT NULL DEFAULT 'delivery' AFTER shipping_amount");
  }
  hasOrderFulfillmentColumn = true;
}

async function listOrders() {
  await ensureOrderFulfillmentColumn();
  return query(
    `SELECT o.id, o.order_number, o.status, o.total_amount, o.currency, o.created_at, o.fulfillment_method,
            c.id AS customer_id,
            CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
            c.email AS customer_email,
            COUNT(oi.id) AS item_count,
            COALESCE(SUM(oi.quantity), 0) AS total_quantity
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     GROUP BY o.id, c.id, c.first_name, c.last_name, c.email
     ORDER BY o.created_at DESC`
  );
}

async function updateOrderStatus(orderId, status) {
  await query('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?', [status, orderId]);
}

async function getOrderDetails(orderId) {
  await ensureCustomerAddressColumns();
  await ensureOrderFulfillmentColumn();
  const orderRows = await query(
    `SELECT o.*, c.first_name, c.last_name, c.email, c.street, c.postal_code, c.city, c.company_name, c.uid_number
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.id = ? LIMIT 1`,
    [orderId]
  );

  const order = orderRows[0] || null;
  if (!order) {
    return null;
  }

  const items = await query(
    `SELECT oi.*, p.title
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?`,
    [orderId]
  );

  return { order, items };
}

module.exports = { listOrders, updateOrderStatus, getOrderDetails };
