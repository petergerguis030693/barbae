const productService = require('../../services/product.service');
const { listSettings } = require('../../services/settings.service');

function toRelativeUploadPath(file) {
  if (!file) return null;
  const normalized = file.path.replace(/\\/g, '/');
  const marker = '/public';
  const index = normalized.indexOf(marker);
  return index >= 0 ? normalized.slice(index + marker.length) : normalized;
}

function sanitizeProductSlug(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^products?\//i, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/gi, '')
    .toLowerCase();
}

function parseLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseOptionStockJson(rawValue) {
  if (!rawValue) return {};
  try {
    const parsed = JSON.parse(String(rawValue));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const normalized = {};
    Object.entries(parsed).forEach(([key, qty]) => {
      const name = String(key || '').trim();
      if (!name) return;
      const amount = Number(qty);
      normalized[name] = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
    });
    return normalized;
  } catch (error) {
    return {};
  }
}

function toStorageStockJson(rawValue) {
  const parsed = parseOptionStockJson(rawValue);
  const filtered = Object.entries(parsed).reduce((acc, [name, qty]) => {
    if (qty > 0) {
      acc[name] = qty;
    }
    return acc;
  }, {});
  return JSON.stringify(filtered);
}

const parseColorStockJson = parseOptionStockJson;
const toStorageColorStockJson = toStorageStockJson;
const parseSizeStockJson = parseOptionStockJson;
const toStorageSizeStockJson = toStorageStockJson;

function parsePersonalizationFieldsJson(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(String(rawValue));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || '').trim()).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function toStoragePersonalizationFieldsJson(rawValue, availableFields = []) {
  let list = [];
  if (Array.isArray(rawValue)) {
    list = rawValue;
  } else if (typeof rawValue === 'string' && rawValue.trim()) {
    list = parsePersonalizationFieldsJson(rawValue);
  }
  const allowed = new Set(availableFields.map((field) => String(field || '').trim()).filter(Boolean));
  const filtered = list
    .map((value) => String(value || '').trim())
    .filter((value) => value && (!allowed.size || allowed.has(value)));
  return JSON.stringify(Array.from(new Set(filtered)));
}

async function getProductOptionConfig() {
  const settings = await listSettings();
  const map = settings.reduce((acc, item) => {
    acc[item.key] = item.value || '';
    return acc;
  }, {});

  return {
    colors: parseLines(map.product_option_colors),
    sizes: parseLines(map.product_option_sizes),
    personalizationFields: parseLines(map.product_option_personalizations)
  };
}

async function index(req, res) {
  const products = await productService.listProducts();

  res.render('layouts/admin', {
    title: 'Produkte',
    activeMenu: 'products',
    body: 'products-list',
    data: { products }
  });
}

async function renderCreate(req, res) {
  const [categories, optionConfig] = await Promise.all([
    productService.listCategoriesForProducts(),
    getProductOptionConfig()
  ]);

  res.render('layouts/admin', {
    title: 'Produkt hinzufügen',
    activeMenu: 'products',
    body: 'product-form',
    data: {
      mode: 'create',
      formAction: '/admin/products/create',
      submitLabel: 'Produkt veröffentlichen',
      product: {
        id: null,
        title: '',
        slug: '',
        sku: '',
        description: '',
        price: '0.00',
        stock: 0,
        has_color_options: 0,
        has_size_options: 0,
        has_personalization_options: 0,
        color_stock_json: '{}',
        size_stock_json: '{}',
        personalization_type: 'none',
        personalization_price: '0.00',
        personalization_fields_json: '[]',
        category_id: '',
        featured_image: null,
        is_active: 1,
        is_bestseller: 0,
        seo_title: '',
        seo_description: '',
        seo_text: '',
        focus_keyword: ''
      },
      categories,
      optionConfig,
      colorStockByColor: {},
      sizeStockBySize: {},
      personalizationFieldsSelected: [],
      gallery: []
    }
  });
}

async function renderEdit(req, res) {
  const [product, categories, optionConfig] = await Promise.all([
    productService.getProductById(req.params.id),
    productService.listCategoriesForProducts(),
    getProductOptionConfig()
  ]);

  if (!product) {
    return res.status(404).send('Produkt nicht gefunden.');
  }

  const gallery = await productService.listProductGallery(req.params.id);

  return res.render('layouts/admin', {
    title: `Produkt bearbeiten #${product.id}`,
    activeMenu: 'products',
    body: 'product-form',
    data: {
      mode: 'edit',
      formAction: `/admin/products/${product.id}/update`,
      submitLabel: 'Änderungen speichern',
      product,
      categories,
      optionConfig,
      colorStockByColor: parseColorStockJson(product.color_stock_json),
      sizeStockBySize: parseSizeStockJson(product.size_stock_json),
      personalizationFieldsSelected: parsePersonalizationFieldsJson(product.personalization_fields_json),
      gallery
    }
  });
}

async function create(req, res) {
  const featuredImage = toRelativeUploadPath(req.files?.featured_image?.[0]);
  const gallery = (req.files?.gallery || []).map((file) => toRelativeUploadPath(file));
  const optionConfig = await getProductOptionConfig();

  await productService.createProduct({
    ...req.body,
    slug: sanitizeProductSlug(req.body.slug),
    is_active: req.body.is_active ? 1 : 0,
    is_bestseller: req.body.is_bestseller ? 1 : 0,
    has_color_options: req.body.has_color_options ? 1 : 0,
    has_size_options: req.body.has_size_options ? 1 : 0,
    color_stock_json: req.body.has_color_options ? toStorageColorStockJson(req.body.color_stock_json) : '{}',
    size_stock_json: req.body.has_size_options ? toStorageSizeStockJson(req.body.size_stock_json) : '{}',
    has_personalization_options: req.body.has_personalization_options ? 1 : 0,
    personalization_type: req.body.has_personalization_options ? 'name' : 'none',
    personalization_price: req.body.has_personalization_options ? Math.max(0, Number(req.body.personalization_price || 0)) : 0,
    personalization_fields_json: req.body.has_personalization_options
      ? toStoragePersonalizationFieldsJson(req.body.personalization_fields, optionConfig.personalizationFields)
      : '[]',
    featured_image: featuredImage,
    gallery
  });
  res.redirect('/admin/products');
}

async function update(req, res) {
  const featuredImage = toRelativeUploadPath(req.files?.featured_image?.[0]);
  const gallery = (req.files?.gallery || []).map((file) => toRelativeUploadPath(file));
  const optionConfig = await getProductOptionConfig();

  await productService.updateProduct(req.params.id, {
    ...req.body,
    slug: sanitizeProductSlug(req.body.slug),
    is_active: req.body.is_active ? 1 : 0,
    is_bestseller: req.body.is_bestseller ? 1 : 0,
    has_color_options: req.body.has_color_options ? 1 : 0,
    has_size_options: req.body.has_size_options ? 1 : 0,
    color_stock_json: req.body.has_color_options ? toStorageColorStockJson(req.body.color_stock_json) : '{}',
    size_stock_json: req.body.has_size_options ? toStorageSizeStockJson(req.body.size_stock_json) : '{}',
    has_personalization_options: req.body.has_personalization_options ? 1 : 0,
    personalization_type: req.body.has_personalization_options ? 'name' : 'none',
    personalization_price: req.body.has_personalization_options ? Math.max(0, Number(req.body.personalization_price || 0)) : 0,
    personalization_fields_json: req.body.has_personalization_options
      ? toStoragePersonalizationFieldsJson(req.body.personalization_fields, optionConfig.personalizationFields)
      : '[]',
    featured_image: featuredImage,
    gallery
  });

  res.redirect('/admin/products');
}

async function remove(req, res) {
  await productService.deleteProduct(req.params.id);
  res.redirect('/admin/products');
}

async function toggleBestseller(req, res) {
  await productService.setBestseller(req.params.id, req.body.is_bestseller ? 1 : 0);
  res.redirect('/admin/products');
}

module.exports = { index, renderCreate, renderEdit, create, update, remove, toggleBestseller };
