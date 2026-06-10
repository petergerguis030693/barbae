const express = require('express');
const controller = require('../../controllers/admin/testimonial.controller');

const router = express.Router();

router.get('/testimonials', controller.index);
router.post('/testimonials/create', controller.create);
router.post('/testimonials/:id/update', controller.update);
router.post('/testimonials/:id/delete', controller.remove);

module.exports = router;
