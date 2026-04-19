const { query } = require('../config/db');

let hasCheckoutColumns = null;
let hasOrderItemOptionColumns = null;

async function ensureOrderCheckoutColumns() {
  if (hasCheckoutColumns === true) {
    return;
  }

  const columns = [
    { name: 'payment_method', ddl: "ALTER TABLE orders ADD COLUMN payment_method VARCHAR(40) NULL AFTER currency" },
    { name: 'subtotal_net', ddl: 'ALTER TABLE orders ADD COLUMN subtotal_net DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total_amount' },
    { name: 'tax_amount', ddl: 'ALTER TABLE orders ADD COLUMN tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER subtotal_net' },
    { name: 'shipping_amount', ddl: 'ALTER TABLE orders ADD COLUMN shipping_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER tax_amount' },
    { name: 'fulfillment_method', ddl: "ALTER TABLE orders ADD COLUMN fulfillment_method VARCHAR(30) NOT NULL DEFAULT 'delivery' AFTER shipping_amount" },
    { name: 'discount_code', ddl: 'ALTER TABLE orders ADD COLUMN discount_code VARCHAR(80) NULL AFTER fulfillment_method' },
    { name: 'discount_net_amount', ddl: 'ALTER TABLE orders ADD COLUMN discount_net_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discount_code' },
    { name: 'discount_tax_amount', ddl: 'ALTER TABLE orders ADD COLUMN discount_tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discount_net_amount' }
  ];

  for (const column of columns) {
    const rows = await query(`SHOW COLUMNS FROM orders LIKE '${column.name}'`);
    if (!rows.length) {
      await query(column.ddl);
    }
  }

  hasCheckoutColumns = true;
}

async function ensureOrderItemOptionColumns() {
  if (hasOrderItemOptionColumns === true) {
    return;
  }

  const columns = [
    { name: 'option_summary', ddl: 'ALTER TABLE order_items ADD COLUMN option_summary VARCHAR(500) NULL AFTER total_price' },
    { name: 'selected_options_json', ddl: 'ALTER TABLE order_items ADD COLUMN selected_options_json TEXT NULL AFTER option_summary' }
  ];

  for (const column of columns) {
    const rows = await query(`SHOW COLUMNS FROM order_items LIKE '${column.name}'`);
    if (!rows.length) {
      await query(column.ddl);
    }
  }

  hasOrderItemOptionColumns = true;
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function calcTotals(items, vatRate = 0.2) {
  const gross = toMoney(items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
  const net = toMoney(gross / (1 + vatRate));
  const tax = toMoney(gross - net);
  return { gross, net, tax, vatRate };
}

function calcOrderTotals(items, shipping = {}, discount = {}) {
  const goods = calcTotals(items);
  const shippingGross = toMoney(shipping.gross || 0);
  const shippingNet = toMoney(shipping.net || 0);
  const shippingTax = toMoney(shipping.tax || 0);
  const discountNet = Math.min(goods.net, toMoney(discount.net || 0));
  const discountTax = Math.min(goods.tax, toMoney(discount.tax || 0));
  const discountGross = toMoney(discountNet + discountTax);
  return {
    gross: toMoney(goods.gross - discountGross + shippingGross),
    net: toMoney(goods.net - discountNet + shippingNet),
    tax: toMoney(goods.tax - discountTax + shippingTax),
    shipping: {
      gross: shippingGross,
      net: shippingNet,
      tax: shippingTax,
      vatRate: Number(shipping.vatRate || 0),
      service: shipping.service || 'Versand'
    },
    discount: {
      code: discount.code || null,
      net: discountNet,
      tax: discountTax,
      gross: discountGross
    },
    goods
  };
}

function generateOrderNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const token = Math.floor(100000 + Math.random() * 900000);
  return `ORD-${y}${m}${d}-${token}`;
}

async function createOrder(payload) {
  await ensureOrderCheckoutColumns();
  await ensureOrderItemOptionColumns();
  const totals = calcOrderTotals(payload.items, payload.shipping || {}, payload.discount || {});
  const orderNumber = generateOrderNumber();

  const result = await query(
    `INSERT INTO orders
     (order_number, customer_id, status, total_amount, subtotal_net, tax_amount, shipping_amount, fulfillment_method, discount_code, discount_net_amount, discount_tax_amount, currency, payment_method)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      orderNumber,
      payload.customerId,
      totals.gross,
      totals.net,
      totals.tax,
      totals.shipping.gross,
      payload.fulfillmentMethod || 'delivery',
      totals.discount.code || null,
      totals.discount.net,
      totals.discount.tax,
      payload.currency || 'EUR',
      payload.paymentMethod || 'manual'
    ]
  );

  for (const item of payload.items) {
    await query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, option_summary, selected_options_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        item.productId,
        item.qty,
        item.unitPrice,
        item.lineTotal,
        item.optionSummary || null,
        item.selectedOptionsJson || null
      ]
    );
  }

  return {
    orderId: result.insertId,
    orderNumber,
    totals
  };
}

async function getOrderByNumber(orderNumber) {
  const rows = await query(
    `SELECT id, order_number, status, total_amount, subtotal_net, tax_amount, shipping_amount,
            discount_code, discount_net_amount, discount_tax_amount, fulfillment_method, currency, payment_method
     FROM orders
     WHERE order_number = ?
     LIMIT 1`,
    [String(orderNumber || '').trim()]
  );
  return rows[0] || null;
}

module.exports = { createOrder, calcTotals, getOrderByNumber };
