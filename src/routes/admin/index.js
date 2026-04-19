const express = require('express');
const { requireAdminAuth } = require('../../middlewares/admin.middleware');

const authRoutes = require('./auth.routes');
const dashboardRoutes = require('./dashboard.routes');
const categoryRoutes = require('./categories.routes');
const productRoutes = require('./products.routes');
const inventoryRoutes = require('./inventory.routes');
const orderRoutes = require('./orders.routes');
const customerRoutes = require('./customers.routes');
const couponRoutes = require('./coupons.routes');
const invoiceRoutes = require('./invoices.routes');
const emailLogRoutes = require('./email-logs.routes');
const customerMessageRoutes = require('./customer-messages.routes');
const seoRoutes = require('./seo.routes');
const settingsRoutes = require('./settings.routes');
const productOptionRoutes = require('./product-options.routes');
const blogRoutes = require('./blog.routes');
const { logout } = require('../../controllers/admin/auth.controller');

const router = express.Router();

router.use(authRoutes);
router.use(requireAdminAuth);
router.get('/logout', logout);
router.use(dashboardRoutes);
router.use(categoryRoutes);
router.use(productRoutes);
router.use(inventoryRoutes);
router.use(orderRoutes);
router.use(customerRoutes);
router.use(couponRoutes);
router.use(invoiceRoutes);
router.use(emailLogRoutes);
router.use(customerMessageRoutes);
router.use(blogRoutes);
router.use(seoRoutes);
router.use(settingsRoutes);
router.use(productOptionRoutes);

module.exports = router;
