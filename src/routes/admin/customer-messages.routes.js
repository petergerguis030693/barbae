const express = require('express');
const controller = require('../../controllers/admin/customer-message.controller');

const router = express.Router();

router.get('/customer-messages', controller.index);
router.post('/customer-messages/send-single', controller.sendSingle);
router.post('/customer-messages/send-newsletter', controller.sendNewsletter);

module.exports = router;
