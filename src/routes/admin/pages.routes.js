const express = require('express');
const controller = require('../../controllers/admin/pages.controller');

const router = express.Router();

router.get('/pages', controller.index);
router.get('/pages/new', controller.renderNew);
router.post('/pages/create', controller.create);
router.get('/pages/:id/edit', controller.edit);
router.post('/pages/:id/update', controller.update);
router.post('/pages/:id/delete', controller.remove);

module.exports = router;
