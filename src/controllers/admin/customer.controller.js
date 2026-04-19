const {
  listCustomers,
  getCustomerById,
  listCustomerOrders,
  updateCustomer,
  deleteCustomerById
} = require('../../services/customer.service');

async function index(req, res) {
  const customers = await listCustomers();
  const flash = req.session.adminCustomerFlash || null;
  req.session.adminCustomerFlash = null;

  res.render('layouts/admin', {
    title: 'Kunden',
    activeMenu: 'customers',
    body: 'customers',
    data: { customers, flash }
  });
}

async function show(req, res) {
  const [customer, orders] = await Promise.all([
    getCustomerById(req.params.id),
    listCustomerOrders(req.params.id)
  ]);

  if (!customer) {
    return res.status(404).send('Kunde nicht gefunden.');
  }

  return res.render('layouts/admin', {
    title: `Kunde ${customer.first_name} ${customer.last_name}`.trim(),
    activeMenu: 'customers',
    body: 'customer-detail',
    data: { customer, orders }
  });
}

async function save(req, res) {
  await updateCustomer(req.params.id, req.body);
  return res.redirect(`/admin/customers/${req.params.id}`);
}

async function destroy(req, res) {
  try {
    await deleteCustomerById(req.params.id);
    req.session.adminCustomerFlash = { type: 'success', text: 'Kunde wurde gelöscht.' };
    return res.redirect('/admin/customers');
  } catch (error) {
    req.session.adminCustomerFlash = {
      type: 'danger',
      text: error.message === 'customer-has-orders'
        ? 'Kunde kann nicht gelöscht werden, weil Bestellungen vorhanden sind.'
        : 'Kunde konnte nicht gelöscht werden.'
    };
    return res.redirect(`/admin/customers/${req.params.id}`);
  }
}

module.exports = { index, show, save, destroy };
