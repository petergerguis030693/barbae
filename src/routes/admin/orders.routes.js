const express = require('express');
const controller = require('../../controllers/admin/order.controller');

const router = express.Router();

router.get('/orders', controller.index);
router.get('/orders/:id', controller.show);
router.post('/orders/:id/status', controller.updateStatus);

module.exports = router;
