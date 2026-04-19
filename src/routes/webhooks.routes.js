const express = require('express');
const { handleStripeWebhook } = require('../controllers/store/stripe-webhook.controller');

const router = express.Router();

router.post('/stripe', handleStripeWebhook);

module.exports = router;

