const express = require('express');
const controller = require('../../controllers/admin/invoice.controller');

const router = express.Router();

router.get('/invoices', controller.index);
router.post('/invoices/:orderId/create', controller.createForOrder);
router.get('/invoices/:id/download', controller.download);
router.post('/invoices/:id/send', controller.sendByMail);

module.exports = router;
