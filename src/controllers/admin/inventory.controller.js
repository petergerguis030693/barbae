const { listInventory } = require('../../services/product.service');

async function index(req, res) {
  const inventory = await listInventory();

  res.render('layouts/admin', {
    title: 'Lager',
    activeMenu: 'inventory',
    body: 'inventory',
    data: { inventory }
  });
}

module.exports = { index };
