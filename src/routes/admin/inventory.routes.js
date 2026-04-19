const express = require('express');
const controller = require('../../controllers/admin/inventory.controller');

const router = express.Router();
router.get('/inventory', controller.index);

module.exports = router;
