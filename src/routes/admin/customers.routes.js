const express = require('express');
const controller = require('../../controllers/admin/customer.controller');

const router = express.Router();
router.get('/customers', controller.index);
router.get('/customers/:id', controller.show);
router.post('/customers/:id/update', controller.save);
router.post('/customers/:id/delete', controller.destroy);

module.exports = router;
