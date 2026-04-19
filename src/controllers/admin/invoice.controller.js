const path = require('path');
const { createOrRefreshInvoice, listInvoices, getInvoiceById } = require('../../services/invoice.service');
const { sendInvoiceMail } = require('../../services/email.service');

async function index(req, res) {
  const invoices = await listInvoices();

  res.render('layouts/admin', {
    title: 'Rechnungen',
    activeMenu: 'invoices',
    body: 'invoices',
    data: { invoices }
  });
}

async function createForOrder(req, res) {
  await createOrRefreshInvoice(req.params.orderId);
  res.redirect('/admin/invoices');
}

async function download(req, res) {
  const invoice = await getInvoiceById(req.params.id);
  if (!invoice || !invoice.pdf_path) {
    return res.status(404).send('Rechnung nicht gefunden.');
  }

  const absolutePath = path.join(__dirname, '..', '..', 'public', invoice.pdf_path.replace(/^\//, ''));
  return res.download(absolutePath, `${invoice.invoice_number}.pdf`);
}

async function sendByMail(req, res) {
  const invoice = await getInvoiceById(req.params.id);
  if (!invoice) {
    return res.status(404).send('Rechnung nicht gefunden.');
  }

  await sendInvoiceMail(invoice);
  return res.redirect('/admin/invoices');
}

module.exports = { index, createForOrder, download, sendByMail };
