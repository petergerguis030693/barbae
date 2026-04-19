function requireAdminAuth(req, res, next) {
  if (!req.session || !req.session.adminUser) {
    return res.redirect('/admin/login');
  }

  res.locals.adminUser = req.session.adminUser;
  return next();
}

module.exports = { requireAdminAuth };
