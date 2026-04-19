const express = require('express');
const controller = require('../../controllers/admin/dashboard.controller');

const router = express.Router();

router.get('/', (req, res) => res.redirect('/admin/dashboard'));
router.get('/dashboard', controller.index);

module.exports = router;
