const seoService = require('../../services/seo.service');

function isStoreSystemSlug(slug) {
  return String(slug || '').toLowerCase().startsWith('store-');
}

async function index(req, res) {
  const pages = await seoService.listContentPages();
  return res.render('layouts/admin', {
    title: 'Inhaltsseiten',
    activeMenu: 'pages',
    body: 'pages-list',
    data: { pages }
  });
}

function renderNew(req, res) {
  return res.render('layouts/admin', {
    title: 'Neue Inhaltsseite',
    activeMenu: 'pages',
    body: 'pages-form',
    data: { page: null }
  });
}

async function create(req, res) {
  const body = req.body || {};
  await seoService.createSeoPage({
    title: body.title,
    slug: body.slug,
    meta_title: body.meta_title,
    meta_description: body.meta_description,
    seo_text: body.seo_text,
    focus_keyword: body.focus_keyword || null,
    og_title: body.og_title || body.meta_title || null,
    og_description: body.og_description || body.meta_description || null,
    canonical_url: body.canonical_url || null,
    robots: body.robots || 'index,follow',
    json_ld: body.json_ld || null,
    is_public_route: '1'
  });
  return res.redirect('/admin/pages');
}

async function edit(req, res) {
  const page = await seoService.getSeoPageById(req.params.id);
  if (!page || isStoreSystemSlug(page.slug)) {
    return res.status(404).send('Seite nicht gefunden.');
  }
  return res.render('layouts/admin', {
    title: `Seite bearbeiten: ${page.title}`,
    activeMenu: 'pages',
    body: 'pages-form',
    data: { page }
  });
}

async function update(req, res) {
  const existing = await seoService.getSeoPageById(req.params.id);
  if (!existing || isStoreSystemSlug(existing.slug)) {
    return res.status(404).send('Seite nicht gefunden.');
  }
  const body = req.body || {};
  await seoService.updateSeoPage(req.params.id, {
    title: body.title,
    slug: body.slug,
    meta_title: body.meta_title,
    meta_description: body.meta_description,
    seo_text: body.seo_text,
    focus_keyword: body.focus_keyword || null,
    og_title: body.og_title || body.meta_title || null,
    og_description: body.og_description || body.meta_description || null,
    canonical_url: body.canonical_url || null,
    robots: body.robots || 'index,follow',
    json_ld: body.json_ld || null,
    is_public_route: '1'
  });
  return res.redirect('/admin/pages');
}

async function remove(req, res) {
  const page = await seoService.getSeoPageById(req.params.id);
  if (!page || isStoreSystemSlug(page.slug)) {
    return res.status(404).send('Seite nicht gefunden.');
  }
  await seoService.deleteSeoPage(req.params.id);
  return res.redirect('/admin/pages');
}

module.exports = {
  index,
  renderNew,
  create,
  edit,
  update,
  remove
};
