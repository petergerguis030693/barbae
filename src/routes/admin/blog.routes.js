const express = require('express');
const controller = require('../../controllers/admin/blog.controller');

const router = express.Router();

router.get('/blog', controller.index);
router.get('/blog/new', controller.renderNew);
router.post('/blog/create', controller.create);
router.get('/blog/:id/edit', controller.edit);
router.post('/blog/:id/update', controller.update);
router.post('/blog/:id/delete', controller.remove);

module.exports = router;
