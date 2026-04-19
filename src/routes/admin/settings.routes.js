const express = require('express');
const controller = require('../../controllers/admin/settings.controller');

const router = express.Router();

router.get('/settings', controller.index);
router.post('/settings', controller.save);
router.post('/settings/create', controller.create);
router.post('/settings/payment', controller.savePayment);
router.post('/settings/shipping', controller.saveShipping);
router.post('/settings/:id/delete', controller.remove);

module.exports = router;
