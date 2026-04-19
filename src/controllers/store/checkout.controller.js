const { listCategories } = require('../../services/category.service');
const { listProducts, getProductsByIds } = require('../../services/product.service');
const { listSettings } = require('../../services/settings.service');
const { getSeoPageBySlug } = require('../../services/seo.service');
const {
  authenticateCustomer,
  registerCustomer,
  upsertGuestCustomer,
  getCustomerById,
  findCustomerByEmail,
  createEmailVerificationToken,
  verifyCustomerEmailByToken,
  createPasswordResetToken,
  getCustomerByPasswordResetToken,
  resetCustomerPasswordByToken
} = require('../../services/store-customer-auth.service');
const { createOrder, calcTotals, getOrderByNumber } = require('../../services/store-checkout.service');
const { clearCustomerCart, listCustomerCart } = require('../../services/store-cart.service');
const { buildCheckoutShipping } = require('../../services/shipping.service');
const { createOrRefreshInvoice, getInvoiceById } = require('../../services/invoice.service');
const {
  getCustomerById: getCustomerProfile,
  listCustomerOrders,
  getCustomerOrderDetailByNumber,
  updateCustomer
} = require('../../services/customer.service');
const {
  listCustomerMessages,
  markCustomerMessagesRead,
  countUnreadCustomerMessages
} = require('../../services/customer-message.service');
const { sendCustomerMail } = require('../../services/email.service');
const { sendInvoiceMail } = require('../../services/email.service');
const { sendOrderConfirmationMail } = require('../../services/email.service');
const { validateCouponForCheckout, markCouponUsed } = require('../../services/coupon.service');
const Stripe = require('stripe');

function buildSeoBottomFromPage(page, fallback = {}) {
  const title = String(page?.title || fallback.title || '').trim();
  const text = String(page?.seo_text || fallback.text || '').trim();
  const focusKeyword = String(page?.focus_keyword || fallback.focusKeyword || '').trim();
  if (!title && !text) return null;
  return { title, text, textHtml: formatSeoTextHtml(text), focusKeyword };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSeoTextHtml(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/<[a-z!/][^>]*>/i.test(text)) return text;
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function buildSeoMeta(req, page, fallback = {}) {
  const baseUrl = buildBaseUrl(req);
  const title = String(page?.meta_title || fallback.meta_title || fallback.title || '').trim();
  const description = String(page?.meta_description || fallback.meta_description || '').trim();
  const canonicalUrl = String(page?.canonical_url || fallback.canonical_url || '').trim();
  const ogTitle = String(page?.og_title || title || '').trim();
  const ogDescription = String(page?.og_description || description || '').trim();
  let ogImage = String(page?.og_image || fallback.og_image || `${baseUrl}/favicon.svg`).trim();
  if (ogImage.startsWith('/')) ogImage = `${baseUrl}${ogImage}`;
  const robots = String(page?.robots || fallback.robots || '').trim();
  const jsonLd = String(page?.json_ld || fallback.json_ld || '').trim();
  return {
    title,
    description,
    canonicalUrl,
    ogTitle,
    ogDescription,
    ogImage,
    ogType: String(fallback.og_type || 'website'),
    robots,
    jsonLd
  };
}

function cleanSlug(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

function buildCategoryUrl(category, byId) {
  const ownSlug = cleanSlug(category.slug) || `id-${category.id}`;
  if (!category.parent_id) {
    return `/${encodeURIComponent(ownSlug)}`;
  }
  const parent = byId.get(Number(category.parent_id));
  const parentSlug = parent ? cleanSlug(parent.slug) || `id-${parent.id}` : `id-${category.parent_id}`;
  return `/${encodeURIComponent(parentSlug)}/${encodeURIComponent(ownSlug)}`;
}

function parseCartJson(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => ({
        productId: Number(item.productId),
        qty: Math.max(1, Number(item.qty || 1)),
        selectedOptions:
          item.selectedOptions && typeof item.selectedOptions === 'object' && !Array.isArray(item.selectedOptions)
            ? Object.keys(item.selectedOptions).reduce((acc, key) => {
                const v = String(item.selectedOptions[key] || '').trim();
                if (v) acc[key] = v;
                return acc;
              }, {})
            : {}
      }))
      .filter((item) => Number.isFinite(item.productId) && item.productId > 0);
  } catch (_error) {
    return [];
  }
}

function pickPaymentProviders(settingsMap) {
  return {
    stripe: Boolean(settingsMap.stripe_public_key && settingsMap.stripe_secret_key),
    klarna: Boolean(settingsMap.klarna_username && (settingsMap.klarna_password || settingsMap.klarna_api_key))
  };
}

function parseExpressShippingPrice(settingsMap = {}) {
  const value = Number(String(settingsMap.express_shipping_price || '0').replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return 0;
  return Number(value.toFixed(2));
}

async function loadLayoutData() {
  const [categoriesRaw, productsRaw, settings] = await Promise.all([listCategories(), listProducts(), listSettings()]);
  const byId = new Map(categoriesRaw.map((item) => [Number(item.id), item]));
  const categories = categoriesRaw.map((item) => ({ ...item, url: buildCategoryUrl(item, byId) }));
  const main = categories.filter((item) => !item.parent_id).slice(0, 2);
  const sub = categories.filter((item) => item.parent_id).slice(0, 8);
  const settingsMap = settings.reduce((acc, item) => {
    acc[item.key] = item.value || '';
    return acc;
  }, {});

  const searchItems = [
    ...categories.map((item) => ({
      type: item.parent_id ? 'Unterkategorie' : 'Kategorie',
      label: item.name,
      url: item.url,
      keywords: [item.name, item.slug].filter(Boolean).join(' ').toLowerCase()
    })),
    ...productsRaw
      .filter((p) => Number(p.is_active) === 1)
      .map((p) => ({
        type: 'Produkt',
        label: p.title,
        url: p.slug ? `/product/${encodeURIComponent(cleanSlug(p.slug))}` : `/product/id-${p.id}`,
        keywords: [p.title, p.sku, p.category_name, p.focus_keyword].filter(Boolean).join(' ').toLowerCase()
      }))
  ];

  return {
    menuMainCategories: main,
    menuSubcategories: sub,
    searchItems,
    paymentProviders: pickPaymentProviders(settingsMap),
    expressShippingPrice: parseExpressShippingPrice(settingsMap)
  };
}

function buildDraftFromBody(body = {}) {
  return {
    customer_mode: String(body.customer_mode || 'guest'),
    first_name: String(body.first_name || '').trim(),
    last_name: String(body.last_name || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    street: String(body.street || '').trim(),
    postal_code: String(body.postal_code || '').trim(),
    city: String(body.city || '').trim(),
    company_name: String(body.company_name || '').trim(),
    uid_number: String(body.uid_number || '').trim(),
    discount_code: String(body.discount_code || '').trim().toUpperCase()
  };
}

function buildBaseUrl(req) {
  const envUrl = String(process.env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (envUrl) {
    return envUrl;
  }
  const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0].trim() : req.protocol;
  return `${proto}://${req.get('host')}`;
}

function renderStoreMailHtml(title, contentHtml, actionLabel, actionUrl) {
  const safeTitle = String(title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <div style="margin:0;padding:24px;background:#f5f1e8;font-family:Montserrat,Arial,sans-serif;color:#2c261f;">
      <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e7dcc8">
        <div style="padding:18px 24px;background:linear-gradient(90deg,#2f221a,#d8be8d);color:#fff;">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;letter-spacing:.08em;">Bar<span style="color:#f2dcac;">Bae</span></div>
        </div>
        <div style="padding:24px;">
          <h1 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;color:#2f221a;">${safeTitle}</h1>
          <div style="font-size:15px;line-height:1.65;color:#43392f;">${contentHtml}</div>
          ${actionLabel && actionUrl ? `<p style="margin:18px 0 0;"><a href="${actionUrl}" style="display:inline-block;background:#c79f5d;color:#fff;text-decoration:none;padding:12px 16px;letter-spacing:.12em;text-transform:uppercase;font-size:12px;">${actionLabel}</a></p>` : ''}
        </div>
      </div>
    </div>`;
}

async function sendVerificationMail(req, customer) {
  if (!customer?.id || !customer.email) return;
  const { token } = await createEmailVerificationToken(customer.id);
  const verifyUrl = `${buildBaseUrl(req)}/account/verify-email?token=${encodeURIComponent(token)}`;
  const subject = 'Bitte bestätige deine E-Mail-Adresse';
  const text = `Bitte bestätige deine E-Mail-Adresse: ${verifyUrl}`;
  const html = renderStoreMailHtml(
    'E-Mail bestätigen',
    `<p>Hallo ${[customer.first_name, customer.last_name].filter(Boolean).join(' ') || ''},</p><p>bitte bestätige deine E-Mail-Adresse, damit dein Kundenkonto vollständig aktiviert wird.</p>`,
    'E-Mail bestätigen',
    verifyUrl
  );
  await sendCustomerMail({ to: customer.email, subject, text, html, related_type: 'email-verification', related_id: customer.id });
}

async function sendPasswordResetMail(req, customer, token) {
  if (!customer?.email || !token) return;
  const resetUrl = `${buildBaseUrl(req)}/account/reset-password?token=${encodeURIComponent(token)}`;
  const subject = 'Passwort zurücksetzen';
  const text = `Passwort zurücksetzen: ${resetUrl}`;
  const html = renderStoreMailHtml(
    'Passwort zurücksetzen',
    `<p>Wir haben eine Anfrage zum Zurücksetzen deines Passworts erhalten.</p><p>Wenn du das warst, nutze bitte den Button unten. Der Link ist zeitlich begrenzt.</p>`,
    'Passwort zurücksetzen',
    resetUrl
  );
  await sendCustomerMail({ to: customer.email, subject, text, html, related_type: 'password-reset', related_id: customer.id });
}

async function renderCheckout(req, res) {
  const [layout, seoPage] = await Promise.all([loadLayoutData(), getSeoPageBySlug('store-checkout')]);
  const customerUser = req.session.customerUser ? await getCustomerById(req.session.customerUser.id) : null;
  const draft = req.session.checkoutDraft || {};
  const error = req.session.checkoutError || '';
  req.session.checkoutError = '';

  return res.render('store/checkout', {
    title: 'Checkout | BarBae',
    query: '',
    menuMainCategories: layout.menuMainCategories,
    menuSubcategories: layout.menuSubcategories,
    searchItems: layout.searchItems,
    paymentProviders: layout.paymentProviders,
    expressShippingPrice: layout.expressShippingPrice,
    customerUser,
    draft,
    error,
    seoBottom: buildSeoBottomFromPage(seoPage),
    seoMeta: buildSeoMeta(req, seoPage, {
      title: 'Checkout | BarBae',
      meta_description: 'Sicherer Checkout bei BarBae.',
      canonical_url: `${buildBaseUrl(req)}/checkout`,
      robots: 'noindex,follow'
    })
  });
}

async function renderAccount(req, res) {
  const [layout, seoPage] = await Promise.all([loadLayoutData(), getSeoPageBySlug('store-account')]);
  const customerUser = req.session.customerUser ? await getCustomerById(req.session.customerUser.id) : null;
  const error = req.session.accountAuthError || '';
  const success = req.session.accountAuthSuccess || '';
  const verifyInfo = req.session.accountVerifyInfo || '';
  req.session.accountAuthError = '';
  req.session.accountAuthSuccess = '';
  req.session.accountVerifyInfo = '';

  const tab = String(req.query.tab || (customerUser ? 'overview' : 'login')).toLowerCase();
  let profile = null;
  let orders = [];
  let orderDetail = null;
  let cartItems = [];
  let messages = [];
  let unreadMessageCount = 0;

  if (customerUser?.id) {
    profile = await getCustomerProfile(customerUser.id);
    orders = await listCustomerOrders(customerUser.id);
    cartItems = await listCustomerCart(customerUser.id);
    unreadMessageCount = await countUnreadCustomerMessages(customerUser.id);
    const orderNumber = String(req.query.order || '').trim();
    if (orderNumber) {
      orderDetail = await getCustomerOrderDetailByNumber(customerUser.id, orderNumber);
    }
    if (tab === 'messages') {
      messages = await listCustomerMessages(customerUser.id, 100);
      if (unreadMessageCount > 0) {
        await markCustomerMessagesRead(customerUser.id);
        messages = messages.map((msg) => ({ ...msg, is_read: 1, read_at: msg.read_at || new Date() }));
        unreadMessageCount = 0;
      }
    }
  }

  return res.render('store/account', {
    title: 'Konto | BarBae',
    query: '',
    menuMainCategories: layout.menuMainCategories,
    menuSubcategories: layout.menuSubcategories,
    searchItems: layout.searchItems,
    customerUser,
    profile,
    orders,
    orderDetail,
    cartItems,
    messages,
    unreadMessageCount,
    activeTab: tab,
    error,
    success,
    verifyInfo,
    seoBottom: buildSeoBottomFromPage(seoPage),
    seoMeta: buildSeoMeta(req, seoPage, {
      title: 'Konto | BarBae',
      meta_description: 'BarBae Kundenkonto verwalten.',
      canonical_url: `${buildBaseUrl(req)}/account`,
      robots: 'noindex,follow'
    })
  });
}

async function verifyAccountEmail(req, res) {
  const token = String(req.query.token || '').trim();
  if (!token) {
    req.session.accountAuthError = 'Verifizierungslink ungültig.';
    req.session.accountAuthSuccess = '';
    return res.redirect('/account');
  }

  const customer = await verifyCustomerEmailByToken(token);
  if (!customer) {
    req.session.accountAuthError = 'Verifizierungslink ist ungültig oder abgelaufen.';
    req.session.accountAuthSuccess = '';
    return res.redirect('/account');
  }

  req.session.customerUser = { id: customer.id, email: customer.email };
  req.session.accountAuthError = '';
  req.session.accountAuthSuccess = 'E-Mail erfolgreich bestätigt.';
  return res.redirect('/account');
}

async function resendAccountVerification(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) {
    req.session.accountAuthError = 'Bitte E-Mail eingeben.';
    req.session.accountAuthSuccess = '';
    return res.redirect('/account');
  }

  const customerLookup = await findCustomerByEmail(email);
  const customer = customerLookup ? await getCustomerById(customerLookup.id) : null;
  if (customer && customer.email && !customer.email_verified_at) {
    try {
      await sendVerificationMail(req, customer);
    } catch (_error) {
      // Do not leak internal mail errors to frontend here.
    }
  }

  req.session.accountAuthError = '';
  req.session.accountVerifyInfo = 'Falls ein Konto existiert, wurde eine Bestätigungs-E-Mail gesendet.';
  req.session.accountAuthSuccess = '';
  return res.redirect('/account');
}

async function renderForgotPassword(req, res) {
  const [layout, seoPage] = await Promise.all([
    loadLayoutData(),
    getSeoPageBySlug('store-account-forgot-password')
  ]);
  const error = req.session.accountResetError || '';
  const success = req.session.accountResetSuccess || '';
  req.session.accountResetError = '';
  req.session.accountResetSuccess = '';

  return res.render('store/account-forgot-password', {
    title: 'Passwort vergessen | BarBae',
    query: '',
    menuMainCategories: layout.menuMainCategories,
    menuSubcategories: layout.menuSubcategories,
    searchItems: layout.searchItems,
    error,
    success,
    seoBottom: buildSeoBottomFromPage(seoPage),
    seoMeta: buildSeoMeta(req, seoPage, {
      title: 'Passwort vergessen | BarBae',
      meta_description: 'Passwort zurücksetzen für dein BarBae Konto.',
      canonical_url: `${buildBaseUrl(req)}/account/forgot-password`,
      robots: 'noindex,nofollow'
    })
  });
}

async function requestPasswordReset(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (email) {
    try {
      const created = await createPasswordResetToken(email);
      if (created?.customer && created?.token) {
        await sendPasswordResetMail(req, created.customer, created.token);
      }
    } catch (_error) {
      // Suppress enumeration and mail errors in UI.
    }
  }

  req.session.accountResetError = '';
  req.session.accountResetSuccess = 'Falls ein verifiziertes Konto existiert, wurde ein Reset-Link gesendet.';
  return res.redirect('/account/forgot-password');
}

async function renderResetPassword(req, res) {
  const [layout, seoPage] = await Promise.all([
    loadLayoutData(),
    getSeoPageBySlug('store-account-reset-password')
  ]);
  const token = String(req.query.token || '').trim();
  const tokenOwner = token ? await getCustomerByPasswordResetToken(token) : null;
  const error = req.session.accountResetError || '';
  const success = req.session.accountResetSuccess || '';
  req.session.accountResetError = '';
  req.session.accountResetSuccess = '';

  return res.render('store/account-reset-password', {
    title: 'Passwort zurücksetzen | BarBae',
    query: '',
    menuMainCategories: layout.menuMainCategories,
    menuSubcategories: layout.menuSubcategories,
    searchItems: layout.searchItems,
    token,
    tokenValid: Boolean(tokenOwner),
    error,
    success,
    seoBottom: buildSeoBottomFromPage(seoPage),
    seoMeta: buildSeoMeta(req, seoPage, {
      title: 'Passwort zurücksetzen | BarBae',
      meta_description: 'Neues Passwort für dein BarBae Konto setzen.',
      canonical_url: `${buildBaseUrl(req)}/account/reset-password`,
      robots: 'noindex,nofollow'
    })
  });
}

async function submitResetPassword(req, res) {
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');
  const passwordConfirm = String(req.body.password_confirm || '');

  if (!token) {
    req.session.accountResetError = 'Reset-Token fehlt.';
    req.session.accountResetSuccess = '';
    return res.redirect('/account/forgot-password');
  }
  if (password !== passwordConfirm) {
    req.session.accountResetError = 'Passwörter stimmen nicht überein.';
    req.session.accountResetSuccess = '';
    return res.redirect(`/account/reset-password?token=${encodeURIComponent(token)}`);
  }

  try {
    const customer = await resetCustomerPasswordByToken(token, password);
    if (!customer) {
      req.session.accountResetError = 'Reset-Link ist ungültig oder abgelaufen.';
      req.session.accountResetSuccess = '';
      return res.redirect('/account/forgot-password');
    }
    req.session.customerUser = { id: customer.id, email: customer.email };
    req.session.accountResetError = '';
    req.session.accountResetSuccess = 'Passwort wurde erfolgreich geändert.';
    return res.redirect('/account');
  } catch (error) {
    req.session.accountResetError = error.message === 'password-too-short' ? 'Passwort muss mindestens 8 Zeichen haben.' : 'Passwort konnte nicht geändert werden.';
    req.session.accountResetSuccess = '';
    return res.redirect(`/account/reset-password?token=${encodeURIComponent(token)}`);
  }
}

async function updateAccountProfile(req, res) {
  if (!req.session.customerUser?.id) {
    req.session.accountAuthError = 'Bitte zuerst einloggen.';
    req.session.accountAuthSuccess = '';
    return res.redirect('/account');
  }

  try {
    await updateCustomer(req.session.customerUser.id, {
      first_name: String(req.body.first_name || '').trim(),
      last_name: String(req.body.last_name || '').trim(),
      email: String(req.body.email || '').trim().toLowerCase(),
      phone: String(req.body.phone || '').trim(),
      street: String(req.body.street || '').trim(),
      postal_code: String(req.body.postal_code || '').trim(),
      city: String(req.body.city || '').trim(),
      company_name: String(req.body.company_name || '').trim(),
      uid_number: String(req.body.uid_number || '').trim()
      ,
      newsletter_opt_in: String(req.body.newsletter_opt_in || '') === '1'
    });

    const fresh = await getCustomerById(req.session.customerUser.id);
    if (fresh?.email) req.session.customerUser.email = fresh.email;
    req.session.accountAuthError = '';
    req.session.accountAuthSuccess = 'Profil gespeichert.';
  } catch (_error) {
    req.session.accountAuthError = 'Profil konnte nicht gespeichert werden.';
    req.session.accountAuthSuccess = '';
  }

  return res.redirect('/account?tab=profile');
}

async function updateAccountAddress(req, res) {
  if (!req.session.customerUser?.id) {
    req.session.accountAuthError = 'Bitte zuerst einloggen.';
    req.session.accountAuthSuccess = '';
    return res.redirect('/account');
  }

  try {
    const current = await getCustomerProfile(req.session.customerUser.id);
    if (!current) throw new Error('customer-not-found');

    await updateCustomer(req.session.customerUser.id, {
      first_name: String(current.first_name || '').trim(),
      last_name: String(current.last_name || '').trim(),
      email: String(current.email || '').trim().toLowerCase(),
      phone: String(req.body.phone || current.phone || '').trim(),
      street: String(req.body.street || '').trim(),
      postal_code: String(req.body.postal_code || '').trim(),
      city: String(req.body.city || '').trim(),
      company_name: String(req.body.company_name || '').trim(),
      uid_number: String(req.body.uid_number || '').trim()
      ,
      newsletter_opt_in: Number(current.newsletter_opt_in || 0) === 1
    });

    req.session.accountAuthError = '';
    req.session.accountAuthSuccess = 'Adresse gespeichert.';
  } catch (_error) {
    req.session.accountAuthError = 'Adresse konnte nicht gespeichert werden.';
    req.session.accountAuthSuccess = '';
  }

  return res.redirect('/account?tab=addresses');
}

async function loginCustomer(req, res) {
  let customer = null;
  try {
    customer = await authenticateCustomer(req.body.login_email, req.body.login_password);
  } catch (error) {
    if (error.message === 'email-not-verified') {
      req.session.checkoutError = 'Bitte zuerst deine E-Mail-Adresse bestätigen.';
      return res.redirect('/checkout');
    }
    throw error;
  }
  if (!customer) {
    req.session.checkoutError = 'Login fehlgeschlagen.';
    return res.redirect('/checkout');
  }

  req.session.customerUser = { id: customer.id, email: customer.email };
  req.session.checkoutError = '';
  return res.redirect('/checkout');
}

async function logoutCustomer(req, res) {
  delete req.session.customerUser;
  return res.redirect('/checkout');
}

async function loginAccount(req, res) {
  let customer = null;
  try {
    customer = await authenticateCustomer(req.body.login_email, req.body.login_password);
  } catch (error) {
    if (error.message === 'email-not-verified') {
      req.session.accountAuthError = 'Bitte zuerst deine E-Mail-Adresse bestätigen.';
      req.session.accountAuthSuccess = '';
      return res.redirect('/account');
    }
    throw error;
  }
  if (!customer) {
    req.session.accountAuthError = 'Login fehlgeschlagen.';
    req.session.accountAuthSuccess = '';
    return res.redirect('/account');
  }

  req.session.customerUser = { id: customer.id, email: customer.email };
  req.session.accountAuthError = '';
  req.session.accountAuthSuccess = 'Erfolgreich eingeloggt.';
  return res.redirect('/account');
}

async function logoutAccount(req, res) {
  delete req.session.customerUser;
  req.session.accountAuthError = '';
  req.session.accountAuthSuccess = 'Erfolgreich abgemeldet.';
  return res.redirect('/account');
}

async function registerCheckoutCustomer(req, res) {
  try {
    const payload = buildDraftFromBody(req.body);
    payload.password = String(req.body.password || '');
    const customer = await registerCustomer(payload);
    await sendVerificationMail(req, customer);
    req.session.checkoutDraft = payload;
    req.session.checkoutError = 'Konto erstellt. Bitte E-Mail bestätigen und danach einloggen.';
    return res.redirect('/checkout');
  } catch (_error) {
    req.session.checkoutError = 'Registrierung fehlgeschlagen.';
    return res.redirect('/checkout');
  }
}

async function registerAccount(req, res) {
  try {
    const payload = buildDraftFromBody(req.body);
    payload.password = String(req.body.password || '');
    const customer = await registerCustomer(payload);
    await sendVerificationMail(req, customer);
    req.session.accountAuthError = '';
    req.session.accountAuthSuccess = 'Konto erstellt. Bitte bestätige deine E-Mail (Link wurde gesendet).';
    return res.redirect('/account');
  } catch (_error) {
    req.session.accountAuthError = 'Registrierung fehlgeschlagen.';
    req.session.accountAuthSuccess = '';
    return res.redirect('/account');
  }
}

async function placeOrder(req, res) {
  const cartItems = parseCartJson(req.body.cart_json);
  if (!cartItems.length) {
    req.session.checkoutError = 'Warenkorb ist leer.';
    return res.redirect('/checkout');
  }

  const draft = buildDraftFromBody(req.body);
  req.session.checkoutDraft = draft;
  req.session.checkoutError = '';

  let customer = null;
  if (req.session.customerUser?.id) {
    customer = await getCustomerById(req.session.customerUser.id);
    await upsertGuestCustomer({ ...draft, email: customer.email || draft.email });
  } else if (draft.customer_mode === 'register') {
    try {
      customer = await registerCustomer({ ...draft, password: String(req.body.password || '') });
      req.session.customerUser = { id: customer.id, email: customer.email };
    } catch (_error) {
      req.session.checkoutError = 'Registrierung fehlgeschlagen.';
      return res.redirect('/checkout');
    }
  } else {
    try {
      customer = await upsertGuestCustomer(draft);
    } catch (_error) {
      req.session.checkoutError = 'Bitte alle Pflichtfelder ausfüllen.';
      return res.redirect('/checkout');
    }
  }

  const productRows = await getProductsByIds(cartItems.map((item) => item.productId));
  const byId = new Map(productRows.map((item) => [Number(item.id), item]));
  const orderItems = [];

  for (const cartItem of cartItems) {
    const product = byId.get(Number(cartItem.productId));
    if (!product || Number(product.is_active) !== 1) {
      continue;
    }
    const qty = Math.max(1, Number(cartItem.qty || 1));
    const unitPrice = Number(product.price || 0);
    orderItems.push({
      productId: Number(product.id),
      qty,
      unitPrice,
      lineTotal: Number((unitPrice * qty).toFixed(2)),
      weightGrams: Math.max(0, Number(product.weight_grams || 0)),
      selectedOptionsJson: JSON.stringify(cartItem.selectedOptions || {}),
      optionSummary: Object.entries(cartItem.selectedOptions || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ')
    });
  }

  if (!orderItems.length) {
    req.session.checkoutError = 'Keine gültigen Produkte im Warenkorb.';
    return res.redirect('/checkout');
  }

  const paymentMethod = String(req.body.payment_method || 'manual');
  const discountCodeInput = String(req.body.discount_code || '').trim().toUpperCase();
  const requestedFulfillment = String(req.body.fulfillment_method || 'delivery');
  const fulfillmentMethod =
    requestedFulfillment === 'click_collect'
      ? 'click_collect'
      : requestedFulfillment === 'delivery_express'
        ? 'delivery_express'
        : 'delivery';
  const settingsRows = await listSettings();
  const settingsMap = settingsRows.reduce((acc, row) => {
    acc[row.key] = row.value || '';
    return acc;
  }, {});
  const expressShippingPrice = parseExpressShippingPrice(settingsMap);
  const shipping = fulfillmentMethod === 'click_collect' ? {
    provider: 'pickup',
    service: 'Click & Collect',
    gross: 0,
    net: 0,
    tax: 0,
    vatRate: 0,
    isAvailable: true
  } : buildCheckoutShipping(orderItems, {
    countryCode: 'AT',
    shippingMethod: fulfillmentMethod === 'delivery_express' ? 'express' : 'standard',
    expressGross: expressShippingPrice
  });
  if (fulfillmentMethod !== 'click_collect' && !shipping.isAvailable) {
    req.session.checkoutError = 'Versand für dieses Gewicht ist aktuell nur auf Anfrage möglich.';
    return res.redirect('/checkout');
  }
  const goodsTotals = calcTotals(orderItems);
  const couponCheck = await validateCouponForCheckout(discountCodeInput, goodsTotals.net);
  if (!couponCheck.ok) {
    req.session.checkoutError = 'Rabattcode ist ungültig oder abgelaufen.';
    return res.redirect('/checkout');
  }
  const created = await createOrder({
    customerId: customer.id,
    items: orderItems,
    shipping,
    discount: couponCheck.discount || {},
    fulfillmentMethod,
    paymentMethod,
    currency: 'EUR'
  });
  console.log(
    `[ORDER] placeOrder success orderId=${created.orderId} orderNumber=${created.orderNumber} customerId=${customer.id} customerEmail=${customer.email || '-'} total=${created.totals.gross} shipping=${created.totals.shipping?.gross || 0} fulfillment=${fulfillmentMethod}`
  );

  req.session.checkoutLastOrder = {
    orderNumber: created.orderNumber,
    totals: created.totals,
    fulfillmentMethod,
    discount: created.totals.discount || null
  };

  if (paymentMethod === 'stripe') {
    const stripeSecretKey = String(settingsMap.stripe_secret_key || '').trim();
    if (!stripeSecretKey) {
      req.session.checkoutError = 'Stripe ist aktuell nicht konfiguriert.';
      return res.redirect('/checkout');
    }

    const stripe = new Stripe(stripeSecretKey);
    const successUrl = `${buildBaseUrl(req)}/checkout/success/${encodeURIComponent(created.orderNumber)}?payment=stripe`;
    const cancelUrl = `${buildBaseUrl(req)}/checkout?payment=cancelled&order=${encodeURIComponent(created.orderNumber)}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customer.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: Math.max(0, Math.round(Number(created.totals.gross || 0) * 100)),
            product_data: {
              name: `Bestellung ${created.orderNumber}`
            }
          }
        }
      ],
      metadata: {
        order_id: String(created.orderId),
        order_number: String(created.orderNumber),
        customer_id: String(customer.id || ''),
        discount_code: String(created.totals.discount?.code || '')
      }
    });
    console.log(`[STRIPE] session created order=${created.orderNumber} id=${session?.id || '-'} url=${session?.url || '-'}`);

    if (!session?.url) {
      req.session.checkoutError = 'Stripe Session konnte nicht gestartet werden.';
      return res.redirect('/checkout');
    }
    const rawStripeUrl = String(session.url || '').trim();
    let checkoutUrl = rawStripeUrl;
    if (rawStripeUrl.startsWith('/')) {
      checkoutUrl = new URL(rawStripeUrl, 'https://checkout.stripe.com').toString();
    } else if (!rawStripeUrl) {
      checkoutUrl = `https://checkout.stripe.com/c/pay/${encodeURIComponent(session.id)}`;
    }
    if (!/^https?:\/\//i.test(checkoutUrl)) {
      checkoutUrl = `https://checkout.stripe.com/c/pay/${encodeURIComponent(session.id)}`;
    }
    console.log(
      `[STRIPE] redirect order=${created.orderNumber} host=${req.get('host')} proto=${req.protocol} xfp=${req.headers['x-forwarded-proto'] || '-'} raw=${rawStripeUrl || '-'} final=${checkoutUrl}`
    );
    res.set('Cache-Control', 'no-store');
    return res
      .status(200)
      .type('html')
      .send(
        `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weiterleitung zu Stripe...</title><meta http-equiv="refresh" content="0;url=${checkoutUrl}"></head><body style="font-family:Arial,sans-serif;padding:24px"><p>Weiterleitung zu Stripe...</p><p><a href="${checkoutUrl}">Falls nichts passiert, hier klicken.</a></p><script>window.location.replace(${JSON.stringify(
          checkoutUrl
        )});</script></body></html>`
      );
  }

  try {
    await sendOrderConfirmationMail({
      orderId: created.orderId,
      orderNumber: created.orderNumber,
      customerEmail: customer.email,
      customerName: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
      totalAmount: created.totals.gross,
      currency: 'EUR'
    });
    console.log(`[ORDER] Confirmation mail sent for orderId=${created.orderId}`);
  } catch (error) {
    console.log(`[ORDER] Confirmation mail failed for orderId=${created.orderId}: ${error.message}`);
  }

  try {
    console.log(`[ORDER] Auto-invoice start for orderId=${created.orderId} orderNumber=${created.orderNumber}`);
    const generated = await createOrRefreshInvoice(created.orderId);
    const invoiceForMail = await getInvoiceById(generated.invoice.id);
    if (invoiceForMail) {
      await sendInvoiceMail(invoiceForMail);
      console.log(`[ORDER] Auto-invoice mail sent for orderId=${created.orderId} invoice=${invoiceForMail.invoice_number}`);
    } else {
      console.log(`[ORDER] Auto-invoice mail skipped: invoice lookup failed for orderId=${created.orderId}`);
    }
  } catch (error) {
    console.log(`[ORDER] Auto-invoice/mail failed for orderId=${created.orderId}: ${error.message}`);
  }

  if (couponCheck?.coupon?.id) {
    try {
      await markCouponUsed(couponCheck.coupon.id);
    } catch (_error) {
      // Do not fail the order after successful placement because of coupon usage counter.
    }
  }

  return res.redirect(`/checkout/success/${encodeURIComponent(created.orderNumber)}`);
}

async function checkoutSuccess(req, res) {
  const [layout, seoPage] = await Promise.all([loadLayoutData(), getSeoPageBySlug('store-checkout-success')]);
  let last = req.session.checkoutLastOrder;
  if (!last || String(last.orderNumber) !== String(req.params.orderNumber || '')) {
    const fallbackOrder = await getOrderByNumber(req.params.orderNumber);
    if (!fallbackOrder) return res.redirect('/checkout');
    last = {
      orderNumber: fallbackOrder.order_number,
      totals: {
        gross: Number(fallbackOrder.total_amount || 0),
        net: Number(fallbackOrder.subtotal_net || 0),
        tax: Number(fallbackOrder.tax_amount || 0),
        shipping: { gross: Number(fallbackOrder.shipping_amount || 0) },
        discount: {
          code: fallbackOrder.discount_code || null,
          net: Number(fallbackOrder.discount_net_amount || 0),
          tax: Number(fallbackOrder.discount_tax_amount || 0)
        }
      },
      fulfillmentMethod: fallbackOrder.fulfillment_method || 'delivery'
    };
  }

  if (req.session.customerUser?.id) {
    try {
      await clearCustomerCart(req.session.customerUser.id);
    } catch (_error) {
      // Keep success page rendering even if cart cleanup fails.
    }
  }

  return res.render('store/checkout-success', {
    title: 'Danke für deine Bestellung | BarBae',
    query: '',
    menuMainCategories: layout.menuMainCategories,
    menuSubcategories: layout.menuSubcategories,
    searchItems: layout.searchItems,
    order: last,
    seoBottom: buildSeoBottomFromPage(seoPage),
    seoMeta: buildSeoMeta(req, seoPage, {
      title: 'Bestellung erfolgreich | BarBae',
      meta_description: 'Vielen Dank für deine Bestellung bei BarBae.',
      canonical_url: `${buildBaseUrl(req)}/checkout/success/${encodeURIComponent(last.orderNumber)}`,
      robots: 'noindex,nofollow'
    })
  });
}

async function checkoutSummary(req, res) {
  const cartItems = parseCartJson(req.body.cart_json);
  const discountCodeInput = String(req.body.discount_code || '').trim().toUpperCase();
  req.session.checkoutDraft = {
    ...(req.session.checkoutDraft || {}),
    discount_code: discountCodeInput
  };
  const requestedFulfillment = String(req.body.fulfillment_method || 'delivery');
  const fulfillmentMethod =
    requestedFulfillment === 'click_collect'
      ? 'click_collect'
      : requestedFulfillment === 'delivery_express'
        ? 'delivery_express'
        : 'delivery';
  if (!cartItems.length) {
    return res.json({ ok: true, totals: { net: 0, tax: 0, shipping: 0, gross: 0 }, fulfillmentMethod });
  }

  const productRows = await getProductsByIds(cartItems.map((item) => item.productId));
  const byId = new Map(productRows.map((item) => [Number(item.id), item]));
  const orderItems = [];
  for (const cartItem of cartItems) {
    const product = byId.get(Number(cartItem.productId));
    if (!product || Number(product.is_active) !== 1) continue;
    const qty = Math.max(1, Number(cartItem.qty || 1));
    const unitPrice = Number(product.price || 0);
    orderItems.push({
      qty,
      lineTotal: Number((unitPrice * qty).toFixed(2)),
      weightGrams: Math.max(0, Number(product.weight_grams || 0))
    });
  }

  const goods = calcTotals(orderItems);
  const couponCheck = await validateCouponForCheckout(discountCodeInput, goods.net);
  const settingsRows = await listSettings();
  const settingsMap = settingsRows.reduce((acc, row) => {
    acc[row.key] = row.value || '';
    return acc;
  }, {});
  const expressShippingPrice = parseExpressShippingPrice(settingsMap);
  const shipping = fulfillmentMethod === 'click_collect'
    ? { gross: 0, net: 0, tax: 0, isAvailable: true }
    : buildCheckoutShipping(orderItems, {
        countryCode: 'AT',
        shippingMethod: fulfillmentMethod === 'delivery_express' ? 'express' : 'standard',
        expressGross: expressShippingPrice
      });
  const totals = {
    discountNet: Number(((couponCheck.ok ? Number(couponCheck.discount?.net || 0) : 0)).toFixed(2)),
    discountTax: Number(((couponCheck.ok ? Number(couponCheck.discount?.tax || 0) : 0)).toFixed(2)),
    net: Number((goods.net - (couponCheck.ok ? Number(couponCheck.discount?.net || 0) : 0) + Number(shipping.net || 0)).toFixed(2)),
    tax: Number((goods.tax - (couponCheck.ok ? Number(couponCheck.discount?.tax || 0) : 0) + Number(shipping.tax || 0)).toFixed(2)),
    shipping: shipping.isAvailable ? Number(shipping.gross || 0) : null,
    discountGross: Number(((couponCheck.ok ? Number(couponCheck.discount?.gross || 0) : 0)).toFixed(2)),
    gross: Number((goods.gross - (couponCheck.ok ? Number(couponCheck.discount?.gross || 0) : 0) + Number(shipping.gross || 0)).toFixed(2)),
    shippingAvailable: Boolean(shipping.isAvailable)
  };
  return res.json({
    ok: true,
    totals,
    fulfillmentMethod,
    coupon: couponCheck.ok
      ? { applied: Boolean(couponCheck.coupon), code: couponCheck.discount?.code || null }
      : { applied: false, invalid: true }
  });
}

module.exports = {
  renderAccount,
  verifyAccountEmail,
  resendAccountVerification,
  renderForgotPassword,
  requestPasswordReset,
  renderResetPassword,
  submitResetPassword,
  renderCheckout,
  loginAccount,
  loginCustomer,
  logoutAccount,
  logoutCustomer,
  registerAccount,
  registerCheckoutCustomer,
  updateAccountProfile,
  updateAccountAddress,
  placeOrder,
  checkoutSuccess,
  checkoutSummary
};
