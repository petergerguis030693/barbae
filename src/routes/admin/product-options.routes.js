const express = require('express');
const controller = require('../../controllers/admin/product-options.controller');

const router = express.Router();

router.get('/product-options', controller.index);
router.post('/product-options', controller.save);

module.exports = router;
