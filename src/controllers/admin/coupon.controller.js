const couponService = require('../../services/coupon.service');

async function index(req, res) {
  const coupons = await couponService.listCoupons();

  res.render('layouts/admin', {
    title: 'Gutscheine',
    activeMenu: 'coupons',
    body: 'coupons',
    data: { coupons }
  });
}

async function create(req, res) {
  await couponService.createCoupon({ ...req.body, is_active: req.body.is_active ? 1 : 0 });
  res.redirect('/admin/coupons');
}

async function update(req, res) {
  await couponService.updateCoupon(req.params.id, { ...req.body, is_active: req.body.is_active ? 1 : 0 });
  res.redirect('/admin/coupons');
}

async function remove(req, res) {
  await couponService.deleteCoupon(req.params.id);
  res.redirect('/admin/coupons');
}

module.exports = { index, create, update, remove };
