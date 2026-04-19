const { listOrders, updateOrderStatus, getOrderDetails } = require('../../services/order.service');

async function index(req, res) {
  const orders = await listOrders();

  res.render('layouts/admin', {
    title: 'Bestellungen',
    activeMenu: 'orders',
    body: 'orders',
    data: { orders }
  });
}

async function updateStatus(req, res) {
  await updateOrderStatus(req.params.id, req.body.status);
  res.redirect('/admin/orders');
}

async function show(req, res) {
  const details = await getOrderDetails(req.params.id);
  if (!details) {
    return res.status(404).send('Bestellung nicht gefunden.');
  }

  return res.render('layouts/admin', {
    title: `Bestellung ${details.order.order_number}`,
    activeMenu: 'orders',
    body: 'order-detail',
    data: details
  });
}

module.exports = { index, updateStatus, show };
