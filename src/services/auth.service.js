const bcrypt = require('bcrypt');
const { query } = require('../config/db');

async function findAdminByEmail(email) {
  const rows = await query('SELECT id, name, email, password_hash, is_active FROM admins WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

async function authenticateAdmin(email, password) {
  const admin = await findAdminByEmail(email);
  if (!admin || !admin.is_active) {
    return null;
  }

  const isValid = await bcrypt.compare(password, admin.password_hash);
  if (!isValid) {
    return null;
  }

  return { id: admin.id, name: admin.name, email: admin.email };
}

module.exports = { authenticateAdmin };
