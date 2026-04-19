const { listCategories } = require('../../services/category.service');
const { listProducts, getProductDetailByRef, listProductGallery } = require('../../services/product.service');
const { listSettings } = require('../../services/settings.service');
const { getSeoPageBySlug } = require('../../services/seo.service');
const { listPublishedBlogPosts, listAllPublishedBlogPosts, getBlogPostBySlug } = require('../../services/blog.service');

function toPublicPath(value) {
  if (!value) {
    return '';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

function mapBlogPosts(posts = []) {
  return posts.map((post) => ({
    ...post,
    heroImageUrl: toPublicPath(post.hero_image_url) || '/favicon.svg',
    blogUrl: `/magazin/${encodeURIComponent(String(post.slug || ''))}`
  }));
}

function buildBaseUrl(req) {
  const envUrl = String(process.env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (envUrl) return envUrl;
  const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0].trim() : req.protocol;
  return `${proto}://${req.get('host')}`;
}

function cleanSlug(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

function parseLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseColorStockJson(rawValue) {
  if (!rawValue) {
    return {};
  }
  try {
    const parsed = JSON.parse(String(rawValue));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce((acc, [color, qty]) => {
      const key = String(color || '').trim();
      const amount = Number(qty);
      if (!key || !Number.isFinite(amount) || amount <= 0) {
        return acc;
      }
      acc[key] = Math.floor(amount);
      return acc;
    }, {});
  } catch (_error) {
    return {};
  }
}

function buildSeoBottomFromPage(page, fallback = {}) {
  const title = String(page?.title || fallback.title || '').trim();
  const text = String(page?.seo_text || fallback.text || '').trim();
  const focusKeyword = String(page?.focus_keyword || fallback.focusKeyword || '').trim();
  if (!title && !text) {
    return null;
  }
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
  if (ogImage.startsWith('/')) {
    ogImage = `${baseUrl}${ogImage}`;
  }
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

function firstTextParagraph(value, maxLength = 320) {
  const text = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
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

function buildProductUrl(product) {
  const slug = cleanSlug(product.slug);
  return slug ? `/product/${encodeURIComponent(slug)}` : `/product/id-${product.id}`;
}

function normalizeCategories(categoriesRaw) {
  const byId = new Map(categoriesRaw.map((item) => [Number(item.id), item]));
  return categoriesRaw.map((item) => ({
    ...item,
    imageUrl: toPublicPath(item.image_path),
    slugClean: cleanSlug(item.slug),
    url: buildCategoryUrl(item, byId)
  }));
}

function mapProducts(products) {
  return products.map((item) => ({
    ...item,
    imageUrl: toPublicPath(item.featured_image),
    productUrl: buildProductUrl(item)
  }));
}

function buildHeroCategories(mainCategories, allCategories) {
  const subByParent = new Map();
  for (const category of allCategories) {
    if (!category.parent_id) {
      continue;
    }
    if (!subByParent.has(category.parent_id)) {
      subByParent.set(category.parent_id, []);
    }
    subByParent.get(category.parent_id).push(category);
  }

  const selected = mainCategories.slice(0, 2).map((category) => ({
    ...category,
    subcategories: (subByParent.get(category.id) || []).slice(0, 4)
  }));

  while (selected.length < 2) {
    selected.push({
      id: `placeholder-${selected.length + 1}`,
      name: selected.length === 0 ? 'Beauty' : 'Styles & Intimates',
      imageUrl: '',
      url: '/',
      subcategories: []
    });
  }

  return selected;
}

function buildSearchItems(mainCategories, subcategories, activeProducts) {
  return [
    ...mainCategories.map((item) => ({
      type: 'Kategorie',
      label: item.name,
      url: item.url,
      keywords: [item.name, item.slugClean].filter(Boolean).join(' ').toLowerCase()
    })),
    ...subcategories.map((item) => ({
      type: 'Unterkategorie',
      label: item.name,
      url: item.url,
      keywords: [item.name, item.slugClean, item.parent_name].filter(Boolean).join(' ').toLowerCase()
    })),
    ...activeProducts.slice(0, 120).map((item) => ({
      type: 'Produkt',
      label: item.title,
      url: buildProductUrl(item),
      keywords: [item.title, item.category_name, item.sku, item.focus_keyword].filter(Boolean).join(' ').toLowerCase()
    }))
  ];
}

function collectDescendantIds(categories, rootId) {
  const queue = [Number(rootId)];
  const ids = new Set(queue);

  while (queue.length) {
    const current = queue.shift();
    for (const item of categories) {
      if (Number(item.parent_id) === Number(current) && !ids.has(Number(item.id))) {
        ids.add(Number(item.id));
        queue.push(Number(item.id));
      }
    }
  }
  return ids;
}

function findMainCategory(categories, slug) {
  const normalized = cleanSlug(slug);
  return (
    categories.find((item) => !item.parent_id && item.slugClean === normalized) ||
    categories.find((item) => !item.parent_id && `id-${item.id}` === normalized) ||
    null
  );
}

function findSubCategory(categories, parentId, slug) {
  const normalized = cleanSlug(slug);
  return (
    categories.find((item) => Number(item.parent_id) === Number(parentId) && item.slugClean === normalized) ||
    categories.find((item) => Number(item.parent_id) === Number(parentId) && `id-${item.id}` === normalized) ||
    null
  );
}

async function loadStoreData() {
  const [categoriesRaw, productsRaw] = await Promise.all([listCategories(), listProducts()]);
  const categories = normalizeCategories(categoriesRaw);
  const mainCategories = categories.filter((item) => !item.parent_id);
  const subcategories = categories.filter((item) => item.parent_id);
  const activeProducts = productsRaw.filter((item) => Number(item.is_active) === 1);

  return {
    categories,
    mainCategories,
    subcategories,
    activeProducts,
    menuMainCategories: mainCategories.slice(0, 2),
    menuSubcategories: subcategories.slice(0, 8),
    searchItems: buildSearchItems(mainCategories, subcategories, activeProducts)
  };
}

async function loadOptionSettings() {
  const settings = await listSettings();
  const map = settings.reduce((acc, item) => {
    acc[item.key] = item.value || '';
    return acc;
  }, {});

  return {
    colors: parseLines(map.product_option_colors),
    sizes: parseLines(map.product_option_sizes),
    personalizations: parseLines(map.product_option_personalizations)
  };
}

async function renderHome(req, res) {
  const [state, homeSeoPage, blogPreviewRows] = await Promise.all([
    loadStoreData(),
    getSeoPageBySlug('store-home'),
    listPublishedBlogPosts(5)
  ]);
  const query = String(req.query.q || '').trim();
  const normalizedQuery = query.toLowerCase();

  const filtered = normalizedQuery
    ? state.activeProducts.filter((item) => {
        const haystack = [item.title, item.description, item.category_name, item.sku, item.focus_keyword]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : state.activeProducts;

  return res.render('store/home', {
    title: 'BarBae Shop',
    query,
    menuMainCategories: state.menuMainCategories,
    menuSubcategories: state.menuSubcategories,
    heroCategories: buildHeroCategories(state.mainCategories, state.categories),
    categoriesWithImage: state.mainCategories,
    featuredProducts: mapProducts(filtered).slice(0, 12),
    magazinePosts: mapBlogPosts(blogPreviewRows),
    searchItems: state.searchItems,
    seoBottom: buildSeoBottomFromPage(homeSeoPage),
    seoMeta: buildSeoMeta(req, homeSeoPage, {
      title: 'BarBae Shop',
      meta_description: 'BarBae Shop mit Beauty, Styles und kuratierten Highlights.',
      canonical_url: `${buildBaseUrl(req)}/`
    })
  });
}

async function renderMagazineIndex(req, res) {
  const [state, posts] = await Promise.all([loadStoreData(), listAllPublishedBlogPosts()]);
  return res.render('store/magazine', {
    title: 'Magazin | BarBae',
    query: '',
    menuMainCategories: state.menuMainCategories,
    menuSubcategories: state.menuSubcategories,
    searchItems: state.searchItems,
    posts: mapBlogPosts(posts),
    seoMeta: buildSeoMeta(req, null, {
      title: 'BarBae Magazin | Beauty, Styles & Inspiration',
      meta_description: 'Magazinartikel von BarBae mit Beauty Routinen, Style Guides und kuratierten Inspirationen.',
      canonical_url: `${buildBaseUrl(req)}/magazin`,
      og_type: 'website'
    })
  });
}

async function renderMagazineArticle(req, res) {
  const [state, article, relatedRows] = await Promise.all([
    loadStoreData(),
    getBlogPostBySlug(req.params.slug),
    listPublishedBlogPosts(6)
  ]);
  if (!article) {
    return res.status(404).send('Magazin Artikel nicht gefunden.');
  }
  const related = mapBlogPosts(relatedRows).filter((post) => Number(post.id) !== Number(article.id)).slice(0, 4);
  const heroImageUrl = toPublicPath(article.hero_image_url) || '/favicon.svg';
  const articleView = {
    ...article,
    heroImageUrl,
    contentHtml: String(article.content_html || '').trim()
  };
  return res.render('store/magazine-article', {
    title: `${article.title} | BarBae Magazin`,
    query: '',
    menuMainCategories: state.menuMainCategories,
    menuSubcategories: state.menuSubcategories,
    searchItems: state.searchItems,
    article: articleView,
    relatedPosts: related,
    seoMeta: buildSeoMeta(req, null, {
      title: `${article.title} | BarBae Magazin`,
      meta_description: firstTextParagraph(article.excerpt || article.content_html, 180),
      canonical_url: `${buildBaseUrl(req)}/magazin/${encodeURIComponent(article.slug)}`,
      og_type: 'article',
      og_image: heroImageUrl
    })
  });
}

async function renderCategoryByPath(req, res) {
  const state = await loadStoreData();
  const mainSlug = req.params.mainSlug;
  const subSlug = req.params.subSlug;

  const mainCategory = findMainCategory(state.categories, mainSlug);
  if (!mainCategory) {
    return res.status(404).send('Kategorie nicht gefunden.');
  }

  let selectedCategory = mainCategory;
  const mainSubcategories = state.categories.filter((item) => Number(item.parent_id) === Number(mainCategory.id));
  let childCategories = mainSubcategories;
  let parentCategory = null;
  let categoryIds = collectDescendantIds(state.categories, mainCategory.id);

  if (subSlug) {
    const subCategory = findSubCategory(state.categories, mainCategory.id, subSlug);
    if (!subCategory) {
      return res.status(404).send('Unterkategorie nicht gefunden.');
    }

    selectedCategory = subCategory;
    parentCategory = mainCategory;
    childCategories = state.categories.filter((item) => Number(item.parent_id) === Number(subCategory.id));
    categoryIds = collectDescendantIds(state.categories, subCategory.id);
  }

  const products = state.activeProducts.filter((item) => categoryIds.has(Number(item.category_id)));
  const categorySeoFallback = {
    title: `${selectedCategory.name} bei BarBae`,
    text:
      String(selectedCategory.seo_text || '').trim() ||
      `Entdecke ${selectedCategory.name} bei BarBae. In dieser Kategorie findest du ausgewählte Produkte mit Fokus auf Qualität, Stil und ein hochwertiges Einkaufserlebnis. ${parentCategory ? `Die Unterkategorie ${selectedCategory.name} ergänzt unser Sortiment in ${parentCategory.name}.` : 'Stöbere durch unsere Auswahl und finde passende Produkte für deinen Look.'}`,
    focusKeyword: selectedCategory.name
  };
  const categoryCanonicalUrl = `${buildBaseUrl(req)}${selectedCategory.url}`;
  const categorySeoMeta = buildSeoMeta(
    req,
    null,
    {
      title: `${selectedCategory.name} | BarBae`,
      meta_description:
        firstTextParagraph(selectedCategory.description || selectedCategory.seo_text, 180) ||
        `Entdecke ${selectedCategory.name} bei BarBae.`,
      canonical_url: categoryCanonicalUrl,
      og_type: 'website',
      og_image: heroCategoryImageForSeo(mainCategory, selectedCategory)
    }
  );

  return res.render('store/category', {
    title: `${selectedCategory.name} | BarBae`,
    query: '',
    selectedCategory,
    mainCategory,
    parentCategory,
    mainSubcategories,
    childCategories,
    menuMainCategories: state.menuMainCategories,
    menuSubcategories: state.menuSubcategories,
    featuredProducts: mapProducts(products),
    searchItems: state.searchItems,
    seoBottom: buildSeoBottomFromPage(null, categorySeoFallback),
    seoMeta: categorySeoMeta
  });
}

async function renderProduct(req, res) {
  const [state, options, product] = await Promise.all([
    loadStoreData(),
    loadOptionSettings(),
    getProductDetailByRef(req.params.ref)
  ]);

  if (!product || Number(product.is_active) !== 1) {
    return res.status(404).send('Produkt nicht gefunden.');
  }

  const galleryRows = await listProductGallery(product.id);
  const featuredImage = toPublicPath(product.featured_image);
  const gallery = galleryRows.map((item) => toPublicPath(item.image_path));
  const media = [featuredImage, ...gallery].filter(Boolean);

  const colorStock = parseColorStockJson(product.color_stock_json);
  const colorNamesFromProduct = Object.keys(colorStock);
  const colorOptions = Number(product.has_color_options)
    ? (colorNamesFromProduct.length ? colorNamesFromProduct : options.colors)
    : [];
  const sizeOptions = Number(product.has_size_options) ? options.sizes : [];
  const personalizationOptions = Number(product.has_personalization_options) ? options.personalizations : [];

  const category = state.categories.find((item) => Number(item.id) === Number(product.category_id)) || null;
  const parentCategory =
    category && category.parent_id
      ? state.categories.find((item) => Number(item.id) === Number(category.parent_id)) || null
      : null;
  const productSeoFallback = {
    title: `${product.title} | Produktdetails`,
    text:
      String(product.seo_text || '').trim() ||
      firstTextParagraph(product.description) ||
      `Produktdetails zu ${product.title}${category ? ` aus der Kategorie ${category.name}` : ''} bei BarBae. Entdecke hochwertige Materialien, stilvolles Design und eine sorgfältig kuratierte Auswahl.`,
    focusKeyword: String(product.focus_keyword || product.title || '').trim()
  };
  const productCanonicalUrl = `${buildBaseUrl(req)}${buildProductUrl(product)}`;
  const productSeoMeta = buildSeoMeta(
    req,
    null,
    {
      title: String(product.seo_title || `${product.title} | BarBae`).trim(),
      meta_description:
        String(product.seo_description || '').trim() ||
        firstTextParagraph(product.description, 180) ||
        `Produktdetails zu ${product.title} bei BarBae.`,
      canonical_url: productCanonicalUrl,
      og_type: 'product',
      og_image: featuredImage || `${buildBaseUrl(req)}/favicon.svg`
    }
  );

  return res.render('store/product', {
    title: `${product.title} | BarBae`,
    query: '',
    menuMainCategories: state.menuMainCategories,
    menuSubcategories: state.menuSubcategories,
    searchItems: state.searchItems,
    product: {
      ...product,
      imageUrl: featuredImage,
      media,
      productUrl: buildProductUrl(product)
    },
    category,
    parentCategory,
    colorOptions,
    colorStock,
    sizeOptions,
    personalizationOptions,
    seoBottom: buildSeoBottomFromPage(null, productSeoFallback),
    seoMeta: productSeoMeta
  });
}

function heroCategoryImageForSeo(mainCategory, selectedCategory) {
  return selectedCategory?.imageUrl || mainCategory?.imageUrl || '';
}

module.exports = { renderHome, renderCategoryByPath, renderProduct, renderMagazineIndex, renderMagazineArticle };
