const express = require('express');
const controller = require('../../controllers/admin/email-log.controller');

const router = express.Router();
router.get('/email-logs', controller.index);

module.exports = router;
