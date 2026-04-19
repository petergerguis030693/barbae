const express = require('express');
const {
  renderHome,
  renderCategoryByPath,
  renderProduct,
  renderMagazineIndex,
  renderMagazineArticle
} = require('../controllers/store/home.controller');
const checkoutController = require('../controllers/store/checkout.controller');
const cartController = require('../controllers/store/cart.controller');

const router = express.Router();

router.get('/', renderHome);
router.get('/magazin', renderMagazineIndex);
router.get('/magazin/:slug', renderMagazineArticle);
router.get('/product/:ref', renderProduct);
router.get('/api/cart', cartController.getCart);
router.post('/api/cart/sync', cartController.syncCart);
router.get('/account', checkoutController.renderAccount);
router.get('/account/verify-email', checkoutController.verifyAccountEmail);
router.post('/account/resend-verification', checkoutController.resendAccountVerification);
router.get('/account/forgot-password', checkoutController.renderForgotPassword);
router.post('/account/forgot-password', checkoutController.requestPasswordReset);
router.get('/account/reset-password', checkoutController.renderResetPassword);
router.post('/account/reset-password', checkoutController.submitResetPassword);
router.post('/account/login', checkoutController.loginAccount);
router.post('/account/logout', checkoutController.logoutAccount);
router.post('/account/register', checkoutController.registerAccount);
router.post('/account/profile', checkoutController.updateAccountProfile);
router.post('/account/address', checkoutController.updateAccountAddress);
router.get('/checkout', checkoutController.renderCheckout);
router.post('/checkout/login', checkoutController.loginCustomer);
router.post('/checkout/logout', checkoutController.logoutCustomer);
router.post('/checkout/register', checkoutController.registerCheckoutCustomer);
router.post('/checkout/place-order', checkoutController.placeOrder);
router.post('/checkout/summary', checkoutController.checkoutSummary);
router.get('/checkout/success/:orderNumber', checkoutController.checkoutSuccess);
router.get('/:mainSlug/:subSlug', renderCategoryByPath);
router.get('/:mainSlug', renderCategoryByPath);

module.exports = router;
