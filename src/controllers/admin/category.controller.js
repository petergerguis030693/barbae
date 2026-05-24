const categoryService = require('../../services/category.service');

function toRelativeUploadPath(file) {
  if (!file) return null;
  const normalized = file.path.replace(/\\/g, '/');
  const marker = '/public';
  const index = normalized.indexOf(marker);
  return index >= 0 ? normalized.slice(index + marker.length) : normalized;
}

async function index(req, res) {
  const categories = await categoryService.listCategories();
  const rootCategories = categories.filter((category) => !category.parent_id);
  const childrenByParent = categories.reduce((acc, category) => {
    if (!category.parent_id) {
      return acc;
    }
    if (!acc[category.parent_id]) {
      acc[category.parent_id] = [];
    }
    acc[category.parent_id].push(category);
    return acc;
  }, {});

  res.render('layouts/admin', {
    title: 'Kategorien',
    activeMenu: 'categories',
    body: 'categories',
    data: { categories, rootCategories, childrenByParent }
  });
}

async function create(req, res) {
  await categoryService.createCategory({
    ...req.body,
    image_path: toRelativeUploadPath(req.file)
  });
  res.redirect('/admin/categories');
}

async function update(req, res) {
  await categoryService.updateCategory(req.params.id, {
    ...req.body,
    remove_image: req.body.remove_image ? 1 : 0,
    image_path: toRelativeUploadPath(req.file)
  });
  res.redirect('/admin/categories');
}

async function createSubcategory(req, res) {
  await categoryService.createCategory({
    name: req.body.name,
    slug: req.body.slug,
    parent_id: req.params.id,
    description: req.body.description,
    seo_text: req.body.seo_text,
    image_path: toRelativeUploadPath(req.file)
  });
  res.redirect('/admin/categories');
}

async function remove(req, res) {
  await categoryService.deleteCategory(req.params.id);
  res.redirect('/admin/categories');
}

async function toggleComingSoon(req, res) {
  const desired = req.body && typeof req.body.value !== 'undefined'
    ? Number(req.body.value) === 1
    : null;
  const categories = await categoryService.listCategories();
  const current = categories.find((item) => Number(item.id) === Number(req.params.id));
  const nextValue = desired === null ? Number(current?.is_coming_soon) !== 1 : desired;
  await categoryService.setCategoryComingSoon(req.params.id, nextValue);
  res.redirect('/admin/categories');
}

module.exports = { index, create, update, createSubcategory, remove, toggleComingSoon };
