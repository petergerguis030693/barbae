const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const controller = require('../../controllers/admin/product.controller');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

const upload = multer({ storage });

router.get('/products', controller.index);
router.get('/products/new', controller.renderCreate);
router.get('/products/:id/edit', controller.renderEdit);
router.post('/products/create', upload.fields([{ name: 'featured_image', maxCount: 1 }, { name: 'gallery', maxCount: 12 }]), controller.create);
router.post('/products/:id/update', upload.fields([{ name: 'featured_image', maxCount: 1 }, { name: 'gallery', maxCount: 12 }]), controller.update);
router.post('/products/:id/bestseller', controller.toggleBestseller);
router.post('/products/:id/delete', controller.remove);

module.exports = router;
