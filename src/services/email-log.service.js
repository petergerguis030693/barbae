const { query } = require('../config/db');

async function listEmailLogs() {
  return query('SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 200');
}

async function logEmail(payload) {
  const { recipient, subject, status, provider_message, related_type, related_id } = payload;
  await query(
    `INSERT INTO email_logs (recipient, subject, status, provider_message, related_type, related_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [recipient, subject, status, provider_message || null, related_type || null, related_id || null]
  );
}

module.exports = { listEmailLogs, logEmail };
