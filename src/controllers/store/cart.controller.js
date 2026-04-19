const {
  listCustomerCart,
  mergeCustomerCartItems,
  setCustomerCartItems,
  normalizeCartItems
} = require('../../services/store-cart.service');

function getSessionCustomerId(req) {
  const id = Number(req.session?.customerUser?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function getCart(req, res) {
  const customerId = getSessionCustomerId(req);
  if (!customerId) {
    return res.json({ ok: true, authenticated: false, items: [] });
  }

  const items = await listCustomerCart(customerId);
  return res.json({ ok: true, authenticated: true, items });
}

async function syncCart(req, res) {
  const customerId = getSessionCustomerId(req);
  const incoming = normalizeCartItems(req.body?.items || []);

  if (!customerId) {
    return res.json({ ok: true, authenticated: false, items: incoming });
  }

  const mode = String(req.body?.mode || 'merge').toLowerCase();
  const items = mode === 'replace' ? await setCustomerCartItems(customerId, incoming) : await mergeCustomerCartItems(customerId, incoming);
  return res.json({ ok: true, authenticated: true, items });
}

module.exports = {
  getCart,
  syncCart
};
