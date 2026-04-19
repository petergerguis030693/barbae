const express = require('express');
const controller = require('../../controllers/admin/auth.controller');

const router = express.Router();

router.get('/login', controller.renderLogin);
router.post('/login', controller.login);

module.exports = router;
