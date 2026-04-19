const blogService = require('../../services/blog.service');

async function index(req, res) {
  const posts = await blogService.listAdminBlogPosts();
  const flash = req.session.adminBlogFlash || null;
  req.session.adminBlogFlash = null;

  return res.render('layouts/admin', {
    title: 'Magazin Blog',
    activeMenu: 'blog',
    body: 'blog-posts',
    data: { posts, flash }
  });
}

function renderNew(req, res) {
  return res.render('layouts/admin', {
    title: 'Blog Artikel anlegen',
    activeMenu: 'blog',
    body: 'blog-form',
    data: {
      mode: 'create',
      post: {
        title: '',
        slug: '',
        category_label: 'BarBae Magazin',
        excerpt: '',
        hero_image_url: '',
        cover_image_alt: '',
        author_name: 'BarBae Redaktion',
        author_role: '',
        read_time_minutes: 4,
        content_html: '',
        is_published: 1,
        is_featured: 0,
        sort_order: 0,
        published_at: ''
      }
    }
  });
}

async function create(req, res) {
  await blogService.createBlogPost(req.body);
  req.session.adminBlogFlash = { type: 'success', text: 'Blog Artikel wurde angelegt.' };
  return res.redirect('/admin/blog');
}

async function edit(req, res) {
  const post = await blogService.getBlogPostById(req.params.id);
  if (!post) return res.status(404).send('Blog Artikel nicht gefunden.');

  return res.render('layouts/admin', {
    title: `Blog bearbeiten: ${post.title}`,
    activeMenu: 'blog',
    body: 'blog-form',
    data: { mode: 'edit', post }
  });
}

async function update(req, res) {
  await blogService.updateBlogPost(req.params.id, req.body);
  req.session.adminBlogFlash = { type: 'success', text: 'Blog Artikel wurde gespeichert.' };
  return res.redirect('/admin/blog');
}

async function remove(req, res) {
  await blogService.deleteBlogPost(req.params.id);
  req.session.adminBlogFlash = { type: 'success', text: 'Blog Artikel wurde gelöscht.' };
  return res.redirect('/admin/blog');
}

module.exports = {
  index,
  renderNew,
  create,
  edit,
  update,
  remove
};
