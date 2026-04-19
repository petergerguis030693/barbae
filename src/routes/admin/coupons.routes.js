const express = require('express');
const controller = require('../../controllers/admin/coupon.controller');

const router = express.Router();

router.get('/coupons', controller.index);
router.post('/coupons/create', controller.create);
router.post('/coupons/:id/update', controller.update);
router.post('/coupons/:id/delete', controller.remove);

module.exports = router;
