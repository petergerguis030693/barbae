const { listSettings, upsertSettings } = require('../../services/settings.service');

function normalizeTextarea(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

async function index(req, res) {
  const settings = await listSettings();
  const map = settings.reduce((acc, item) => {
    acc[item.key] = item.value || '';
    return acc;
  }, {});

  res.render('layouts/admin', {
    title: 'Produktoptionen',
    activeMenu: 'product-options',
    body: 'product-options',
    data: {
      colors: map.product_option_colors || '',
      sizes: map.product_option_sizes || '',
      personalizationFields: map.product_option_personalizations || ''
    }
  });
}

async function save(req, res) {
  await upsertSettings({
    product_option_colors: normalizeTextarea(req.body.product_option_colors),
    product_option_sizes: normalizeTextarea(req.body.product_option_sizes),
    product_option_personalizations: normalizeTextarea(req.body.product_option_personalizations)
  });

  return res.redirect('/admin/product-options');
}

module.exports = { index, save };
