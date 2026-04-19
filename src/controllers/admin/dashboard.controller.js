const { getDashboardKPIs } = require('../../services/dashboard.service');

async function index(req, res) {
  const kpis = await getDashboardKPIs();

  return res.render('layouts/admin', {
    title: 'Dashboard',
    activeMenu: 'dashboard',
    body: 'dashboard',
    data: { kpis }
  });
}

module.exports = { index };
