const { authenticateAdmin } = require('../../services/auth.service');

function renderLogin(req, res) {
  if (req.session.adminUser) {
    return res.redirect('/admin/dashboard');
  }

  return res.render('admin/login', { title: 'Admin Login', error: null });
}

async function login(req, res) {
  const { email, password } = req.body;

  try {
    const admin = await authenticateAdmin((email || '').trim().toLowerCase(), password || '');
    if (!admin) {
      return res.status(401).render('admin/login', {
        title: 'Admin Login',
        error: 'Ungültige Zugangsdaten.'
      });
    }

    req.session.adminUser = admin;
    return res.redirect('/admin/dashboard');
  } catch (error) {
    return res.status(500).render('admin/login', {
      title: 'Admin Login',
      error: 'Interner Fehler beim Login.'
    });
  }
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
}

module.exports = { renderLogin, login, logout };

