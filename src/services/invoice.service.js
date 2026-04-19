const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { query } = require('../config/db');
const { getOrderDetails } = require('./order.service');

const invoicesDir = path.join(__dirname, '..', 'public', 'uploads', 'invoices');
if (!fs.existsSync(invoicesDir)) {
  fs.mkdirSync(invoicesDir, { recursive: true });
}

let invoicesTableReady = false;

async function ensureInvoicesTable() {
  if (invoicesTableReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS invoices (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_id INT UNSIGNED NOT NULL,
      invoice_number VARCHAR(80) NOT NULL,
      pdf_path VARCHAR(255) NULL,
      issued_at DATETIME NULL,
      sent_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_invoices_order_id (order_id),
      UNIQUE KEY uniq_invoices_invoice_number (invoice_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  invoicesTableReady = true;
}

function generateInvoiceNumber(orderId) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${datePart}-${String(orderId).padStart(6, '0')}`;
}

function formatDate(dateValue) {
  return new Date(dateValue).toLocaleDateString('de-DE');
}

function addBusinessDays(dateValue, businessDays = 1) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  let added = 0;
  while (added < businessDays) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }
  return date;
}

function formatMoney(value, currency = 'EUR') {
  const currencyCode = ['manual', 'stripe', 'klarna'].includes(String(currency || '').toLowerCase()) ? 'EUR' : (currency || 'EUR');
  const amount = Number(value || 0).toFixed(2);
  return `${amount} ${String(currencyCode).toUpperCase() === 'EUR' ? '€' : currencyCode}`;
}

function buildInvoicePdf(filePath, orderData, invoiceNumber) {
  return new Promise((resolve, reject) => {
    const { order, items } = orderData;
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = fs.createWriteStream(filePath);
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 80;
    const startX = 40;
    const footerY = doc.page.height - 170;
    const legalY = doc.page.height - 92;
    const rowHeight = 16;
    const maxCursorYBeforeTotals = footerY - 88;
    const grossTotal = Number(order.total_amount || 0);
    const netTotal = Number(order.subtotal_net || 0);
    const vatAmount = Number(order.tax_amount || 0);
    const vatPercent = netTotal > 0 && vatAmount >= 0
      ? Math.round((vatAmount / netTotal) * 100)
      : 20;
    const shippingGross = Number(order.shipping_amount || 0);
    const discountNet = Number(order.discount_net_amount || 0);
    const discountTax = Number(order.discount_tax_amount || 0);
    const discountGross = Number((discountNet + discountTax).toFixed(2));
    const fulfillmentMethod = String(order.fulfillment_method || 'delivery');

    doc.pipe(stream);

    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f2f2f2');
    doc.fillColor('#111111');

    // Brand header (logo-style wordmark) instead of a large generic invoice title.
    doc.font('Times-Roman').fontSize(34).fillColor('#2f221a').text('Bar', startX, 34, { continued: true });
    doc.fillColor('#d8be8d').text('Bae');
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text('Rechnung', startX, 72);

    // Issuer details in header (right aligned).
    const issuerY = 86;
    const issuerX = startX + contentWidth - 220;
    const issuerWidth = 220;
    doc.fillColor('#444444').fontSize(8);
    doc.text('MT VISUAL GmbH', issuerX, issuerY, { width: issuerWidth, align: 'right', lineBreak: false });
    doc.text('Kernstockweg 4/1', issuerX, issuerY + 11, { width: issuerWidth, align: 'right', lineBreak: false });
    doc.text('8144 Badegg', issuerX, issuerY + 22, { width: issuerWidth, align: 'right', lineBreak: false });
    doc.text('FN 653701 a', issuerX, issuerY + 33, { width: issuerWidth, align: 'right', lineBreak: false });
    doc.text('ATU82165103', issuerX, issuerY + 44, { width: issuerWidth, align: 'right', lineBreak: false });

    const topBlockY = 150;
    const leftColX = startX;
    const rightColX = startX + contentWidth - 220;
    const customerName = `${order.first_name || ''} ${order.last_name || ''}`.trim() || '-';
    const companyName = order.company_name || '';
    const uidNumber = order.uid_number || '';
    const street = order.street || '';
    const postalCode = order.postal_code || '';
    const city = order.city || '';
    const cityLine = [postalCode, city].filter(Boolean).join(' ');

    doc.fontSize(9).fillColor('#555555').text('RECHNUNG AN:', leftColX, topBlockY);
    doc.fillColor('#111111').fontSize(10).text(customerName, leftColX, topBlockY + 18);
    if (companyName) {
      doc.text(companyName, leftColX, topBlockY + 34);
    }
    doc.text(street || '-', leftColX, topBlockY + (companyName ? 50 : 34));
    doc.text(cityLine || '-', leftColX, topBlockY + (companyName ? 66 : 50));
    if (uidNumber) {
      doc.fillColor('#333333').fontSize(9).text(`UID: ${uidNumber}`, leftColX, topBlockY + (companyName ? 82 : 66));
      doc.text(order.email || '-', leftColX, topBlockY + (companyName ? 96 : 80));
    } else {
      doc.fillColor('#333333').fontSize(9).text(order.email || '-', leftColX, topBlockY + (companyName ? 82 : 66));
    }

    const invoiceDate = new Date(order.created_at || Date.now());
    const deliveryDate = addBusinessDays(invoiceDate, 1);
    doc.fillColor('#555555').fontSize(9).text(`RECHNUNG NR. ${invoiceNumber}`, rightColX, topBlockY, { align: 'right', width: 220 });
    doc.fillColor('#111111').fontSize(9).text(`Rechnungsdatum: ${formatDate(invoiceDate)}`, rightColX, topBlockY + 18, { align: 'right', width: 220 });
    doc.fillColor('#111111').fontSize(9).text(`Lieferdatum: ${formatDate(deliveryDate)}`, rightColX, topBlockY + 31, { align: 'right', width: 220 });

    const customerBottomY = topBlockY + (companyName ? (uidNumber ? 96 : 82) : (uidNumber ? 80 : 66));
    const dividerY = Math.max(customerBottomY + 20, 248);
    doc.strokeColor('#2d2d2d').lineWidth(0.6).moveTo(startX, dividerY).lineTo(startX + contentWidth, dividerY).stroke();

    const tableTop = dividerY + 18;
    const descX = startX;
    const tableRightX = startX + contentWidth;
    const qtyWidth = 52;
    const priceWidth = 72;
    const sumWidth = 72;
    const colGap = 12;
    const sumX = tableRightX - sumWidth;
    const priceX = sumX - colGap - priceWidth;
    const qtyX = priceX - colGap - qtyWidth;
    const descWidth = qtyX - descX - 16;

    doc.fillColor('#111111').fontSize(9);
    doc.text('Beschreibung', descX, tableTop, { width: descWidth, align: 'left' });
    doc.text('Anzahl', qtyX, tableTop, { width: qtyWidth, align: 'right' });
    doc.text('Preis', priceX, tableTop, { width: priceWidth, align: 'right' });
    doc.text('Summe', sumX, tableTop, { width: sumWidth, align: 'right' });
    doc.strokeColor('#2d2d2d').lineWidth(1).moveTo(startX, tableTop + 14).lineTo(startX + contentWidth, tableTop + 14).stroke();

    let cursorY = tableTop + 24;
    let hiddenItemCount = 0;
    items.forEach((item) => {
      if ((cursorY + rowHeight) > maxCursorYBeforeTotals) {
        hiddenItemCount += 1;
        return;
      }
      const title = item.option_summary ? `${item.title || 'Produkt'} (${item.option_summary})` : (item.title || 'Produkt');
      doc.fillColor('#222222').fontSize(8.5).text(title, descX, cursorY, {
        width: descWidth,
        height: rowHeight,
        ellipsis: true,
        lineBreak: false
      });
      doc.text(String(item.quantity || 0), qtyX, cursorY, { width: qtyWidth, align: 'right' });
      doc.text(formatMoney(item.unit_price, order.currency), priceX, cursorY, { width: priceWidth, align: 'right' });
      doc.text(formatMoney(item.total_price, order.currency), sumX, cursorY, { width: sumWidth, align: 'right' });
      cursorY += rowHeight;
      doc.strokeColor('#cccccc').lineWidth(0.6).moveTo(startX, cursorY - 6).lineTo(startX + contentWidth, cursorY - 6).stroke();
    });

    if (shippingGross > 0 || fulfillmentMethod === 'click_collect') {
      if ((cursorY + rowHeight) > maxCursorYBeforeTotals) {
        hiddenItemCount += 1;
      } else {
      const shippingLabel =
        fulfillmentMethod === 'click_collect'
          ? 'Click & Collect (Abholung)'
          : fulfillmentMethod === 'delivery_express'
            ? 'Express Versand'
            : 'Versand';
      const shippingLineAmount = fulfillmentMethod === 'click_collect' ? 0 : shippingGross;
      doc.fillColor('#222222').fontSize(8.5).text(shippingLabel, descX, cursorY, {
        width: descWidth,
        height: rowHeight,
        ellipsis: true,
        lineBreak: false
      });
      doc.text('1', qtyX, cursorY, { width: qtyWidth, align: 'right' });
      doc.text(formatMoney(shippingLineAmount, order.currency), priceX, cursorY, { width: priceWidth, align: 'right' });
      doc.text(formatMoney(shippingLineAmount, order.currency), sumX, cursorY, { width: sumWidth, align: 'right' });
      cursorY += rowHeight;
      doc.strokeColor('#cccccc').lineWidth(0.6).moveTo(startX, cursorY - 6).lineTo(startX + contentWidth, cursorY - 6).stroke();
      }
    }

    if (hiddenItemCount > 0) {
      doc.fillColor('#666666').fontSize(8).text(
        `+ ${hiddenItemCount} weitere Position${hiddenItemCount > 1 ? 'en' : ''} (in Bestellung enthalten)`,
        descX,
        cursorY + 4,
        { width: descWidth + qtyWidth + priceWidth + sumWidth + (colGap * 3) }
      );
      cursorY += 14;
    }

    const totalsY = cursorY + 6;
    const totalsLabelX = startX + contentWidth - 220;
    const totalsValueX = startX + contentWidth - 130;
    doc.fillColor('#111111').fontSize(9);
    if (discountGross > 0) {
      doc.text(`Rabatt${order.discount_code ? ` (${order.discount_code})` : ''}`, totalsLabelX, totalsY - 18, { width: 120, align: 'left' });
      doc.text(`- ${formatMoney(discountGross, order.currency)}`, totalsValueX, totalsY - 18, { width: 130, align: 'right' });
    }
    doc.text('Netto gesamt', totalsLabelX, totalsY, { width: 120, align: 'left' });
    doc.text(formatMoney(netTotal, order.currency), totalsValueX, totalsY, { width: 130, align: 'right' });
    doc.text(`MwSt. ${vatPercent}%`, totalsLabelX, totalsY + 18, { width: 120, align: 'left' });
    doc.text(formatMoney(vatAmount, order.currency), totalsValueX, totalsY + 18, { width: 130, align: 'right' });
    doc.strokeColor('#2d2d2d').lineWidth(1).moveTo(totalsLabelX, totalsY + 38).lineTo(startX + contentWidth, totalsY + 38).stroke();
    doc.font('Helvetica-Bold').fontSize(22);
    doc.text('Summe', totalsLabelX, totalsY + 48, { width: 120, align: 'left' });
    doc.text(formatMoney(grossTotal, order.currency), totalsValueX - 10, totalsY + 48, { width: 140, align: 'right', lineBreak: false });
    doc.font('Helvetica');

    doc.fillColor('#555555').fontSize(9).text('ZAHLUNGSINFORMATIONEN:', startX, footerY);
    doc.fillColor('#111111').fontSize(9).text('Empfaenger: BARBAE', startX, footerY + 14, { lineBreak: false });
    doc.text('Verwendungszweck: ' + order.order_number, startX, footerY + 28, { lineBreak: false });
    doc.text(`MwSt. (${vatPercent}%): laut Rechnung ausgewiesen`, startX, footerY + 42, { lineBreak: false });

    const legalColWidth = contentWidth / 2;
    doc.strokeColor('#cfcfcf').lineWidth(0.6).moveTo(startX, legalY - 8).lineTo(startX + contentWidth, legalY - 8).stroke();
    doc.fillColor('#444444').fontSize(8);
    doc.text('MT VISUAL GmbH', startX, legalY, { width: legalColWidth, align: 'left', lineBreak: false });
    doc.text('FN 653701 a', startX, legalY + 11, { width: legalColWidth, align: 'left', lineBreak: false });
    doc.text('ATU82165103', startX, legalY + 22, { width: legalColWidth, align: 'left', lineBreak: false });
    doc.text('Kernstockweg 4/1', startX + (legalColWidth / 2), legalY, { width: legalColWidth, align: 'center', lineBreak: false });
    doc.text('8144 Badegg', startX + (legalColWidth / 2), legalY + 11, { width: legalColWidth, align: 'center', lineBreak: false });

    doc.fillColor('#555555').fontSize(8).text('Seite 1 von 1', startX, legalY, {
      width: contentWidth,
      align: 'right',
      lineBreak: false
    });

    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function createOrRefreshInvoice(orderId) {
  await ensureInvoicesTable();
  const orderData = await getOrderDetails(orderId);
  if (!orderData) {
    throw new Error('Bestellung nicht gefunden.');
  }

  const existingRows = await query('SELECT * FROM invoices WHERE order_id = ? LIMIT 1', [orderId]);
  let invoice = existingRows[0] || null;

  if (!invoice) {
    const invoiceNumber = generateInvoiceNumber(orderId);
    const insertResult = await query('INSERT INTO invoices (order_id, invoice_number, issued_at) VALUES (?, ?, NOW())', [orderId, invoiceNumber]);
    const newRows = await query('SELECT * FROM invoices WHERE id = ? LIMIT 1', [insertResult.insertId]);
    invoice = newRows[0];
  }

  const fileName = `${invoice.invoice_number}.pdf`;
  const relativePath = `/uploads/invoices/${fileName}`;
  const absolutePath = path.join(invoicesDir, fileName);

  await buildInvoicePdf(absolutePath, orderData, invoice.invoice_number);
  await query('UPDATE invoices SET pdf_path = ?, issued_at = NOW() WHERE id = ?', [relativePath, invoice.id]);

  const updated = await query('SELECT * FROM invoices WHERE id = ? LIMIT 1', [invoice.id]);
  return { invoice: updated[0], orderData, absolutePath };
}

async function listInvoices() {
  await ensureInvoicesTable();
  return query(
    `SELECT i.id, i.invoice_number, i.pdf_path, i.issued_at, i.sent_at,
            o.id AS order_id,
            o.order_number,
            c.id AS customer_id,
            CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
            c.email AS customer_email
     FROM invoices i
     INNER JOIN orders o ON o.id = i.order_id
     LEFT JOIN customers c ON c.id = o.customer_id
     ORDER BY i.issued_at DESC`
  );
}

async function getInvoiceById(invoiceId) {
  await ensureInvoicesTable();
  const rows = await query(
    `SELECT i.*, o.order_number, o.id AS order_id,
            CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
            c.email AS customer_email
     FROM invoices i
     INNER JOIN orders o ON o.id = i.order_id
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE i.id = ? LIMIT 1`,
    [invoiceId]
  );
  return rows[0] || null;
}

async function markInvoiceSent(invoiceId) {
  await ensureInvoicesTable();
  await query('UPDATE invoices SET sent_at = NOW() WHERE id = ?', [invoiceId]);
}

module.exports = { createOrRefreshInvoice, listInvoices, getInvoiceById, markInvoiceSent };
