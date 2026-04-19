const { query } = require('../config/db');

async function getDashboardKPIs() {
  const [products] = await query('SELECT COUNT(*) AS count FROM products');
  const [orders] = await query('SELECT COUNT(*) AS count FROM orders');
  const [customers] = await query('SELECT COUNT(*) AS count FROM customers');
  const [revenue] = await query('SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE status IN ("paid", "shipped", "completed")');

  const recentOrders = await query(
    `SELECT o.id, o.order_number, o.status, o.total_amount, o.created_at,
            CONCAT(c.first_name, ' ', c.last_name) AS customer_name
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     ORDER BY o.created_at DESC
     LIMIT 8`
  );

  return {
    products: products.count,
    orders: orders.count,
    customers: customers.count,
    revenue: revenue.total,
    recentOrders
  };
}

module.exports = { getDashboardKPIs };
