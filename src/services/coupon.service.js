const { query } = require('../config/db');

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function listCoupons() {
  return query('SELECT * FROM coupons ORDER BY created_at DESC');
}

async function createCoupon(payload) {
  const { code, type, value, starts_at, ends_at, usage_limit, is_active } = payload;
  await query(
    `INSERT INTO coupons (code, type, value, starts_at, ends_at, usage_limit, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [code, type, Number(value), starts_at || null, ends_at || null, usage_limit ? Number(usage_limit) : null, Number(is_active)]
  );
}

async function updateCoupon(id, payload) {
  const { code, type, value, starts_at, ends_at, usage_limit, is_active } = payload;
  await query(
    `UPDATE coupons SET code = ?, type = ?, value = ?, starts_at = ?, ends_at = ?, usage_limit = ?, is_active = ? WHERE id = ?`,
    [code, type, Number(value), starts_at || null, ends_at || null, usage_limit ? Number(usage_limit) : null, Number(is_active), id]
  );
}

async function deleteCoupon(id) {
  await query('DELETE FROM coupons WHERE id = ?', [id]);
}

async function getCouponByCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;
  const rows = await query('SELECT * FROM coupons WHERE UPPER(code) = ? LIMIT 1', [normalized]);
  return rows[0] || null;
}

function couponIsCurrentlyValid(coupon, now = new Date()) {
  if (!coupon) return { ok: false, reason: 'not-found' };
  if (Number(coupon.is_active) !== 1) return { ok: false, reason: 'inactive' };
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return { ok: false, reason: 'not-started' };
  if (coupon.ends_at && new Date(coupon.ends_at) < now) return { ok: false, reason: 'expired' };
  const usageLimit = Number(coupon.usage_limit || 0);
  const usedCount = Number(coupon.used_count || 0);
  if (usageLimit > 0 && usedCount >= usageLimit) return { ok: false, reason: 'usage-limit' };
  return { ok: true };
}

function calcCouponDiscountNet(coupon, goodsNet) {
  const baseNet = Math.max(0, Number(goodsNet || 0));
  if (!coupon || baseNet <= 0) {
    return { code: null, net: 0, tax: 0, gross: 0, label: '' };
  }
  let discountNet = 0;
  const type = String(coupon.type || '').toLowerCase();
  const value = Number(coupon.value || 0);
  if (type === 'percent') {
    discountNet = toMoney(baseNet * (Math.max(0, value) / 100));
  } else if (type === 'fixed') {
    discountNet = toMoney(Math.max(0, value));
  }
  discountNet = Math.min(baseNet, discountNet);
  const discountTax = toMoney(discountNet * 0.2);
  const discountGross = toMoney(discountNet + discountTax);
  return {
    couponId: Number(coupon.id),
    code: String(coupon.code || '').toUpperCase(),
    type,
    value: toMoney(value),
    net: discountNet,
    tax: discountTax,
    gross: discountGross,
    label: type === 'percent' ? `${toMoney(value)}%` : `${toMoney(value)} EUR`
  };
}

async function validateCouponForCheckout(code, goodsNet) {
  const normalized = String(code || '').trim();
  if (!normalized) return { ok: true, coupon: null, discount: { net: 0, tax: 0, gross: 0 } };
  const coupon = await getCouponByCode(normalized);
  const validity = couponIsCurrentlyValid(coupon);
  if (!validity.ok) {
    return { ok: false, reason: validity.reason, coupon: null, discount: { net: 0, tax: 0, gross: 0 } };
  }
  return { ok: true, coupon, discount: calcCouponDiscountNet(coupon, goodsNet) };
}

async function markCouponUsed(couponId) {
  const id = Number(couponId);
  if (!id) return;
  const hasUsedCount = await query("SHOW COLUMNS FROM coupons LIKE 'used_count'");
  if (!hasUsedCount.length) return;
  await query('UPDATE coupons SET used_count = COALESCE(used_count, 0) + 1 WHERE id = ?', [id]);
}

async function markCouponUsedByCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return;
  const coupon = await getCouponByCode(normalized);
  if (!coupon?.id) return;
  await markCouponUsed(coupon.id);
}

module.exports = {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponByCode,
  validateCouponForCheckout,
  calcCouponDiscountNet,
  markCouponUsed,
  markCouponUsedByCode
};
