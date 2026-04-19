const { query } = require('../config/db');

let messageTablesReady = false;
let customerNewsletterColumnReady = false;

async function ensureCustomerNewsletterColumn() {
  if (customerNewsletterColumnReady) return;
  const rows = await query("SHOW COLUMNS FROM customers LIKE 'newsletter_opt_in'");
  if (!rows.length) {
    await query('ALTER TABLE customers ADD COLUMN newsletter_opt_in TINYINT(1) NOT NULL DEFAULT 0 AFTER uid_number');
  }
  customerNewsletterColumnReady = true;
}

async function ensureMessageTables() {
  if (messageTablesReady) return;
  await ensureCustomerNewsletterColumn();

  await query(
    `CREATE TABLE IF NOT EXISTS customer_messages (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      customer_id INT UNSIGNED NOT NULL,
      kind ENUM('message','newsletter') NOT NULL DEFAULT 'message',
      subject VARCHAR(190) NOT NULL,
      body_text TEXT NULL,
      body_html MEDIUMTEXT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      sent_via_email TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_customer_messages_customer (customer_id),
      KEY idx_customer_messages_read (customer_id, is_read)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  messageTablesReady = true;
}

async function listCustomerMessages(customerId, limit = 50) {
  await ensureMessageTables();
  return query(
    `SELECT id, kind, subject, body_text, body_html, is_read, sent_via_email, created_at, read_at
     FROM customer_messages
     WHERE customer_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [Number(customerId), Math.max(1, Math.min(200, Number(limit) || 50))]
  );
}

async function markCustomerMessagesRead(customerId) {
  await ensureMessageTables();
  await query(
    `UPDATE customer_messages
     SET is_read = 1, read_at = NOW()
     WHERE customer_id = ? AND is_read = 0`,
    [Number(customerId)]
  );
}

async function countUnreadCustomerMessages(customerId) {
  await ensureMessageTables();
  const rows = await query(
    'SELECT COUNT(*) AS count FROM customer_messages WHERE customer_id = ? AND is_read = 0',
    [Number(customerId)]
  );
  return Number(rows[0]?.count || 0);
}

async function createCustomerMessage({ customerId, kind = 'message', subject, bodyText, bodyHtml, sentViaEmail = false }) {
  await ensureMessageTables();
  const normalizedKind = kind === 'newsletter' ? 'newsletter' : 'message';
  const result = await query(
    `INSERT INTO customer_messages (customer_id, kind, subject, body_text, body_html, sent_via_email)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      Number(customerId),
      normalizedKind,
      String(subject || '').trim() || '(ohne Betreff)',
      bodyText ? String(bodyText) : null,
      bodyHtml ? String(bodyHtml) : null,
      sentViaEmail ? 1 : 0
    ]
  );
  return result.insertId;
}

async function listNewsletterRecipients() {
  await ensureCustomerNewsletterColumn();
  return query(
    `SELECT id, first_name, last_name, email
     FROM customers
     WHERE newsletter_opt_in = 1 AND email IS NOT NULL AND email <> ''
     ORDER BY id ASC`
  );
}

async function listCustomersForMessaging() {
  await ensureCustomerNewsletterColumn();
  return query(
    `SELECT id, first_name, last_name, email, newsletter_opt_in
     FROM customers
     ORDER BY created_at DESC, id DESC`
  );
}

async function listRecentCustomerMessages(limit = 100) {
  await ensureMessageTables();
  return query(
    `SELECT cm.id, cm.customer_id, cm.kind, cm.subject, cm.is_read, cm.sent_via_email, cm.created_at,
            c.first_name, c.last_name, c.email
     FROM customer_messages cm
     LEFT JOIN customers c ON c.id = cm.customer_id
     ORDER BY cm.created_at DESC, cm.id DESC
     LIMIT ?`,
    [Math.max(1, Math.min(500, Number(limit) || 100))]
  );
}

module.exports = {
  ensureCustomerNewsletterColumn,
  listCustomerMessages,
  markCustomerMessagesRead,
  countUnreadCustomerMessages,
  createCustomerMessage,
  listNewsletterRecipients,
  listCustomersForMessaging,
  listRecentCustomerMessages
};
