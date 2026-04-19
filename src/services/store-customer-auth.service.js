const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../config/db');

let hasAuthColumns = null;

async function ensureCustomerAuthColumns() {
  if (hasAuthColumns === true) {
    return;
  }

  const columns = [
    { name: 'password_hash', ddl: 'ALTER TABLE customers ADD COLUMN password_hash VARCHAR(255) NULL AFTER email' },
    { name: 'email_verified_at', ddl: 'ALTER TABLE customers ADD COLUMN email_verified_at DATETIME NULL AFTER password_hash' },
    { name: 'email_verification_token_hash', ddl: 'ALTER TABLE customers ADD COLUMN email_verification_token_hash VARCHAR(64) NULL AFTER email_verified_at' },
    { name: 'email_verification_expires_at', ddl: 'ALTER TABLE customers ADD COLUMN email_verification_expires_at DATETIME NULL AFTER email_verification_token_hash' },
    { name: 'password_reset_token_hash', ddl: 'ALTER TABLE customers ADD COLUMN password_reset_token_hash VARCHAR(64) NULL AFTER email_verification_expires_at' },
    { name: 'password_reset_expires_at', ddl: 'ALTER TABLE customers ADD COLUMN password_reset_expires_at DATETIME NULL AFTER password_reset_token_hash' }
  ];

  for (const column of columns) {
    const rows = await query(`SHOW COLUMNS FROM customers LIKE '${column.name}'`);
    if (!rows.length) {
      await query(column.ddl);
    }
  }

  hasAuthColumns = true;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function createRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function addMinutes(minutes) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + Number(minutes || 0));
  return date;
}

async function findCustomerByEmail(email) {
  await ensureCustomerAuthColumns();
  const rows = await query('SELECT * FROM customers WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

async function getCustomerById(id) {
  await ensureCustomerAuthColumns();
  const rows = await query('SELECT * FROM customers WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function registerCustomer(payload) {
  await ensureCustomerAuthColumns();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const firstName = String(payload.first_name || '').trim();
  const lastName = String(payload.last_name || '').trim();

  if (!email || !password || !firstName || !lastName) {
    throw new Error('missing-fields');
  }

  const existing = await findCustomerByEmail(email);
  if (existing && existing.password_hash) {
    throw new Error('email-exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    await query(
      `UPDATE customers
       SET first_name = ?, last_name = ?, password_hash = ?, phone = ?, street = ?, postal_code = ?, city = ?, company_name = ?, uid_number = ?,
           email_verified_at = NULL, email_verification_token_hash = NULL, email_verification_expires_at = NULL,
           password_reset_token_hash = NULL, password_reset_expires_at = NULL
       WHERE id = ?`,
      [
        firstName,
        lastName,
        passwordHash,
        payload.phone || null,
        payload.street || null,
        payload.postal_code || null,
        payload.city || null,
        payload.company_name || null,
        payload.uid_number || null,
        existing.id
      ]
    );
    return getCustomerById(existing.id);
  }

  const result = await query(
    `INSERT INTO customers
     (first_name, last_name, email, password_hash, phone, street, postal_code, city, company_name, uid_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      firstName,
      lastName,
      email,
      passwordHash,
      payload.phone || null,
      payload.street || null,
      payload.postal_code || null,
      payload.city || null,
      payload.company_name || null,
      payload.uid_number || null
    ]
  );

  return getCustomerById(result.insertId);
}

async function authenticateCustomer(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const customer = await findCustomerByEmail(normalizedEmail);
  if (!customer || !customer.password_hash) {
    return null;
  }

  const ok = await bcrypt.compare(String(password || ''), customer.password_hash);
  if (!ok) {
    return null;
  }

  if (!customer.email_verified_at) {
    throw new Error('email-not-verified');
  }

  return customer;
}

async function createEmailVerificationToken(customerId) {
  await ensureCustomerAuthColumns();
  const token = createRawToken();
  const tokenHash = hashToken(token);
  const expiresAt = addMinutes(60 * 24); // 24h

  await query(
    `UPDATE customers
     SET email_verification_token_hash = ?, email_verification_expires_at = ?, email_verified_at = NULL
     WHERE id = ?`,
    [tokenHash, expiresAt, Number(customerId)]
  );

  return { token, expiresAt };
}

async function verifyCustomerEmailByToken(rawToken) {
  await ensureCustomerAuthColumns();
  const tokenHash = hashToken(rawToken);
  const rows = await query(
    `SELECT * FROM customers
     WHERE email_verification_token_hash = ?
       AND email_verification_expires_at IS NOT NULL
       AND email_verification_expires_at >= NOW()
     LIMIT 1`,
    [tokenHash]
  );
  const customer = rows[0] || null;
  if (!customer) return null;

  await query(
    `UPDATE customers
     SET email_verified_at = NOW(),
         email_verification_token_hash = NULL,
         email_verification_expires_at = NULL
     WHERE id = ?`,
    [customer.id]
  );
  return getCustomerById(customer.id);
}

async function createPasswordResetToken(email) {
  await ensureCustomerAuthColumns();
  const customer = await findCustomerByEmail(email);
  if (!customer || !customer.password_hash || !customer.email_verified_at) {
    return null;
  }

  const token = createRawToken();
  const tokenHash = hashToken(token);
  const expiresAt = addMinutes(30);

  await query(
    `UPDATE customers
     SET password_reset_token_hash = ?, password_reset_expires_at = ?
     WHERE id = ?`,
    [tokenHash, expiresAt, customer.id]
  );

  return { customer: await getCustomerById(customer.id), token, expiresAt };
}

async function getCustomerByPasswordResetToken(rawToken) {
  await ensureCustomerAuthColumns();
  const tokenHash = hashToken(rawToken);
  const rows = await query(
    `SELECT * FROM customers
     WHERE password_reset_token_hash = ?
       AND password_reset_expires_at IS NOT NULL
       AND password_reset_expires_at >= NOW()
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function resetCustomerPasswordByToken(rawToken, password) {
  await ensureCustomerAuthColumns();
  const customer = await getCustomerByPasswordResetToken(rawToken);
  if (!customer) return null;

  const nextPassword = String(password || '');
  if (nextPassword.length < 8) {
    throw new Error('password-too-short');
  }

  const passwordHash = await bcrypt.hash(nextPassword, 10);
  await query(
    `UPDATE customers
     SET password_hash = ?,
         password_reset_token_hash = NULL,
         password_reset_expires_at = NULL,
         email_verified_at = COALESCE(email_verified_at, NOW())
     WHERE id = ?`,
    [passwordHash, customer.id]
  );
  return getCustomerById(customer.id);
}

async function upsertGuestCustomer(payload) {
  await ensureCustomerAuthColumns();
  const email = String(payload.email || '').trim().toLowerCase();
  const firstName = String(payload.first_name || '').trim();
  const lastName = String(payload.last_name || '').trim();

  if (!email || !firstName || !lastName) {
    throw new Error('missing-fields');
  }

  const existing = await findCustomerByEmail(email);
  if (existing) {
    await query(
      `UPDATE customers
       SET first_name = ?, last_name = ?, phone = ?, street = ?, postal_code = ?, city = ?, company_name = ?, uid_number = ?
       WHERE id = ?`,
      [
        firstName,
        lastName,
        payload.phone || null,
        payload.street || null,
        payload.postal_code || null,
        payload.city || null,
        payload.company_name || null,
        payload.uid_number || null,
        existing.id
      ]
    );
    return getCustomerById(existing.id);
  }

  const result = await query(
    `INSERT INTO customers
     (first_name, last_name, email, phone, street, postal_code, city, company_name, uid_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      firstName,
      lastName,
      email,
      payload.phone || null,
      payload.street || null,
      payload.postal_code || null,
      payload.city || null,
      payload.company_name || null,
      payload.uid_number || null
    ]
  );

  return getCustomerById(result.insertId);
}

module.exports = {
  findCustomerByEmail,
  getCustomerById,
  registerCustomer,
  authenticateCustomer,
  upsertGuestCustomer,
  createEmailVerificationToken,
  verifyCustomerEmailByToken,
  createPasswordResetToken,
  getCustomerByPasswordResetToken,
  resetCustomerPasswordByToken
};
