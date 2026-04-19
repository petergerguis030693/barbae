const { query } = require('../config/db');

async function listSettings() {
  return query('SELECT id, `key`, `value`, updated_at FROM settings ORDER BY `key` ASC');
}

function normalizeSettingValue(value) {
  if (Array.isArray(value)) {
    const lastValue = value[value.length - 1];
    return lastValue == null ? '' : String(lastValue);
  }

  return value == null ? '' : String(value);
}

async function upsertSettings(settingsObj) {
  const entries = Object.entries(settingsObj);

  for (const [key, value] of entries) {
    const normalizedValue = normalizeSettingValue(value);
    await query(
      'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()',
      [key, normalizedValue]
    );
  }
}

async function createSetting(key, value) {
  await query(
    'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()',
    [key, normalizeSettingValue(value)]
  );
}

async function deleteSetting(id) {
  await query('DELETE FROM settings WHERE id = ?', [id]);
}

module.exports = { listSettings, upsertSettings, createSetting, deleteSetting };
