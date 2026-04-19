const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const controller = require('../../controllers/admin/category.controller');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'categories');
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

router.get('/categories', controller.index);
router.post('/categories/create', upload.single('image'), controller.create);
router.post('/categories/:id/update', upload.single('image'), controller.update);
router.post('/categories/:id/subcategories/create', upload.single('image'), controller.createSubcategory);
router.post('/categories/:id/delete', controller.remove);

module.exports = router;
