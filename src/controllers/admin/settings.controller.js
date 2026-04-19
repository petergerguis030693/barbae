const {
  listSettings,
  upsertSettings,
  createSetting,
  deleteSetting
} = require('../../services/settings.service');

const PAYMENT_KEYS = [
  'stripe_public_key',
  'stripe_secret_key',
  'stripe_webhook_secret',
  'klarna_username',
  'klarna_password',
  'klarna_api_key'
];

const SHIPPING_KEYS = ['express_shipping_price'];

async function index(req, res) {
  const settings = await listSettings();
  const settingsMap = settings.reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});

  const regularSettings = settings.filter((item) => !PAYMENT_KEYS.includes(item.key) && !SHIPPING_KEYS.includes(item.key));

  res.render('layouts/admin', {
    title: 'Einstellungen',
    activeMenu: 'settings',
    body: 'settings',
    data: {
      settings: regularSettings,
      paymentSettings: settingsMap,
      shippingSettings: settingsMap
    }
  });
}

async function save(req, res) {
  await upsertSettings(req.body);
  res.redirect('/admin/settings');
}

async function create(req, res) {
  const key = String(req.body.key || '').trim();
  const value = req.body.value || '';

  if (!key) {
    return res.redirect('/admin/settings');
  }

  await createSetting(key, value);
  return res.redirect('/admin/settings');
}

async function remove(req, res) {
  await deleteSetting(req.params.id);
  return res.redirect('/admin/settings');
}

async function savePayment(req, res) {
  const payload = {
    stripe_public_key: req.body.stripe_public_key || '',
    stripe_secret_key: req.body.stripe_secret_key || '',
    stripe_webhook_secret: req.body.stripe_webhook_secret || '',
    klarna_username: req.body.klarna_username || '',
    klarna_password: req.body.klarna_password || '',
    klarna_api_key: req.body.klarna_api_key || ''
  };

  await upsertSettings(payload);
  return res.redirect('/admin/settings');
}

async function saveShipping(req, res) {
  const payload = {
    express_shipping_price: req.body.express_shipping_price || ''
  };
  await upsertSettings(payload);
  return res.redirect('/admin/settings');
}

module.exports = { index, save, create, remove, savePayment, saveShipping };
