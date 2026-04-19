const express = require('express');
const controller = require('../../controllers/admin/seo.controller');

const router = express.Router();

router.get('/seo', controller.index);
router.get('/seo/new', controller.renderCreate);
router.post('/seo/create', controller.create);
router.get('/seo/:id/edit', controller.edit);
router.post('/seo/:id/update', controller.update);
router.post('/seo/:id/delete', controller.remove);

module.exports = router;
