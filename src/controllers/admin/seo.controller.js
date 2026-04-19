const seoService = require('../../services/seo.service');

async function index(req, res) {
  const pages = await seoService.listSeoPages();

  return res.render('layouts/admin', {
    title: 'SEO Texte',
    activeMenu: 'seo',
    body: 'seo-pages',
    data: { pages }
  });
}

function renderCreate(req, res) {
  return res.render('layouts/admin', {
    title: 'SEO Seite hinzufügen',
    activeMenu: 'seo',
    body: 'seo-create',
    data: {}
  });
}

async function create(req, res) {
  await seoService.createSeoPage(req.body);
  return res.redirect('/admin/seo');
}

async function edit(req, res) {
  const page = await seoService.getSeoPageById(req.params.id);
  if (!page) {
    return res.status(404).send('SEO Seite nicht gefunden.');
  }

  return res.render('layouts/admin', {
    title: `SEO bearbeiten: ${page.title}`,
    activeMenu: 'seo',
    body: 'seo-edit',
    data: { page }
  });
}

async function update(req, res) {
  await seoService.updateSeoPage(req.params.id, req.body);
  return res.redirect('/admin/seo');
}

async function remove(req, res) {
  await seoService.deleteSeoPage(req.params.id);
  return res.redirect('/admin/seo');
}

module.exports = {
  index,
  renderCreate,
  create,
  edit,
  update,
  remove
};
