const fs = require('fs');
const path = require('path');
const mailer = require('../config/mailer');
const { logEmail } = require('./email-log.service');
const { markInvoiceSent } = require('./invoice.service');

async function sendInvoiceMail(invoice) {
  const fromAddress = process.env.MAIL_FROM || 'admin@localhost';
  const subject = `Rechnung ${invoice.invoice_number}`;

  if (!invoice.customer_email) {
    await logEmail({ recipient: '-', subject, status: 'failed', provider_message: 'Kunde hat keine E-Mail-Adresse.', related_type: 'invoice', related_id: invoice.id });
    throw new Error('Kunde hat keine E-Mail-Adresse.');
  }

  const relativePath = invoice.pdf_path || '';
  const attachmentPath = path.join(__dirname, '..', 'public', relativePath.replace(/^\//, ''));

  if (!fs.existsSync(attachmentPath)) {
    await logEmail({ recipient: invoice.customer_email, subject, status: 'failed', provider_message: 'Rechnungs-PDF nicht gefunden.', related_type: 'invoice', related_id: invoice.id });
    throw new Error('Rechnungs-PDF nicht gefunden.');
  }

  try {
    console.log(
      `[MAIL] sendInvoiceMail -> to=${invoice.customer_email} invoice=${invoice.invoice_number} from="${fromAddress}"`
    );
    const info = await mailer.sendMail({
      from: fromAddress,
      to: invoice.customer_email,
      subject,
      text: `Hallo ${invoice.customer_name || ''}, im Anhang befindet sich Ihre Rechnung ${invoice.invoice_number}.`,
      attachments: [{ filename: `${invoice.invoice_number}.pdf`, path: attachmentPath }]
    });

    console.log(
      `[MAIL] sendInvoiceMail success -> to=${invoice.customer_email} invoice=${invoice.invoice_number} messageId=${info.messageId || 'ok'}`
    );
    await markInvoiceSent(invoice.id);
    await logEmail({ recipient: invoice.customer_email, subject, status: 'sent', provider_message: info.messageId || 'ok', related_type: 'invoice', related_id: invoice.id });
  } catch (error) {
    console.log(
      `[MAIL] sendInvoiceMail failed -> to=${invoice.customer_email || '-'} invoice=${invoice.invoice_number || '-'} error=${error.message}`
    );
    await logEmail({ recipient: invoice.customer_email, subject, status: 'failed', provider_message: error.message, related_type: 'invoice', related_id: invoice.id });
    throw error;
  }
}

async function sendCustomerMail(payload) {
  const fromAddress = process.env.MAIL_FROM || 'admin@localhost';
  const to = String(payload?.to || '').trim();
  const subject = String(payload?.subject || '').trim() || 'Nachricht von BarBae';
  const text = String(payload?.text || '').trim();
  const html = payload?.html ? String(payload.html) : null;
  const replyTo = payload?.replyTo ? String(payload.replyTo).trim() : null;
  const relatedType = payload?.related_type || 'customer-message';
  const relatedId = payload?.related_id || null;

  if (!to) {
    await logEmail({ recipient: '-', subject, status: 'failed', provider_message: 'Empfänger fehlt.', related_type: relatedType, related_id: relatedId });
    throw new Error('Empfänger fehlt.');
  }

  try {
    console.log(`[MAIL] sendCustomerMail -> to=${to} subject="${subject}" from="${fromAddress}"${replyTo ? ` replyTo="${replyTo}"` : ''}`);
    const info = await mailer.sendMail({
      from: fromAddress,
      to,
      subject,
      text: text || subject,
      html: html || undefined,
      replyTo: replyTo || undefined
    });
    console.log(`[MAIL] sendCustomerMail success -> to=${to} messageId=${info.messageId || 'jsonTransport'}`);
    await logEmail({ recipient: to, subject, status: 'sent', provider_message: info.messageId || 'ok', related_type: relatedType, related_id: relatedId });
    return info;
  } catch (error) {
    console.log(`[MAIL] sendCustomerMail failed -> to=${to} error=${error.message}`);
    await logEmail({ recipient: to, subject, status: 'failed', provider_message: error.message, related_type: relatedType, related_id: relatedId });
    throw error;
  }
}

async function sendOrderConfirmationMail(payload) {
  const orderNumber = String(payload?.orderNumber || '').trim();
  const customerEmail = String(payload?.customerEmail || '').trim();
  const customerName = String(payload?.customerName || '').trim();
  const total = Number(payload?.totalAmount || 0).toFixed(2);
  const currency = String(payload?.currency || 'EUR');
  const fromAddress = process.env.MAIL_FROM || 'admin@localhost';
  const subject = `Bestellbestätigung ${orderNumber}`;

  if (!customerEmail) {
    await logEmail({ recipient: '-', subject, status: 'failed', provider_message: 'Kunde hat keine E-Mail-Adresse.', related_type: 'order-confirmation', related_id: payload?.orderId || null });
    throw new Error('Kunde hat keine E-Mail-Adresse.');
  }

  const html = `
    <div style="margin:0;padding:24px;background:#f5f1e8;font-family:Montserrat,Arial,sans-serif;color:#2c261f;">
      <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e7dcc8">
        <div style="padding:18px 24px;background:linear-gradient(90deg,#2f221a,#d8be8d);color:#fff;">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;letter-spacing:.08em;">Bar<span style="color:#f2dcac;">Bae</span></div>
          <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.9;">Bestellbestätigung</div>
        </div>
        <div style="padding:24px;">
          <h1 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;color:#2f221a;">Danke für deine Bestellung</h1>
          <p style="margin:0 0 8px;">Hallo ${customerName || 'lieber Kunde'},</p>
          <p style="margin:0 0 8px;">deine Bestellung ist bei uns eingegangen.</p>
          <p style="margin:0 0 6px;"><strong>Bestellnummer:</strong> ${orderNumber}</p>
          <p style="margin:0 0 16px;"><strong>Gesamt:</strong> ${total} ${currency}</p>
          <p style="margin:0;">Die Rechnung senden wir dir ebenfalls per E-Mail als PDF-Anhang.</p>
        </div>
      </div>
    </div>`;

  try {
    console.log(`[MAIL] sendOrderConfirmationMail -> to=${customerEmail} order=${orderNumber} from="${fromAddress}"`);
    const info = await mailer.sendMail({
      from: fromAddress,
      to: customerEmail,
      subject,
      text: `Danke für deine Bestellung. Bestellnummer: ${orderNumber}. Gesamt: ${total} ${currency}.`,
      html
    });
    console.log(`[MAIL] sendOrderConfirmationMail success -> to=${customerEmail} order=${orderNumber} messageId=${info.messageId || 'ok'}`);
    await logEmail({ recipient: customerEmail, subject, status: 'sent', provider_message: info.messageId || 'ok', related_type: 'order-confirmation', related_id: payload?.orderId || null });
    return info;
  } catch (error) {
    console.log(`[MAIL] sendOrderConfirmationMail failed -> to=${customerEmail} order=${orderNumber} error=${error.message}`);
    await logEmail({ recipient: customerEmail, subject, status: 'failed', provider_message: error.message, related_type: 'order-confirmation', related_id: payload?.orderId || null });
    throw error;
  }
}

async function sendLowStockAlertMail(payload) {
  const products = Array.isArray(payload?.products) ? payload.products : [];
  if (!products.length) return null;

  const recipient = String(payload?.recipient || 'shopping@barbae.at').trim() || 'shopping@barbae.at';
  const fromAddress = process.env.MAIL_FROM || 'admin@localhost';
  const subject =
    products.length === 1
      ? `Lagerwarnung: ${products[0].title} unter 20 %`
      : `Lagerwarnung: ${products.length} Produkte unter 20 %`;

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const rows = products
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #efe6d2;">${esc(item.title)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #efe6d2;color:#7f7568;">${esc(item.sku || '-')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #efe6d2;text-align:right;font-weight:600;">${esc(item.stock)} / ${esc(item.stockInitial)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #efe6d2;text-align:right;color:#a05a2c;font-weight:600;">${esc(item.percent)} %</td>
      </tr>`
    )
    .join('');

  const plainLines = products.map(
    (item) =>
      `- ${item.title} (SKU ${item.sku || '-'}): ${item.stock}/${item.stockInitial} (${item.percent} %)`
  );

  const html = `
    <div style="margin:0;padding:24px;background:#f5f1e8;font-family:Montserrat,Arial,sans-serif;color:#2c261f;">
      <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e7dcc8">
        <div style="padding:18px 24px;background:linear-gradient(90deg,#2f221a,#d8be8d);color:#fff;">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;letter-spacing:.08em;">Bar<span style="color:#f2dcac;">Bae</span></div>
          <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.9;">Lagerwarnung</div>
        </div>
        <div style="padding:24px;">
          <h1 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;color:#2f221a;">Lagerbestand unter 20 %</h1>
          <p style="margin:0 0 16px;color:#5a4f3f;">Folgende Artikel liegen unter dem 20-%-Schwellwert ihres Startbestands. Bitte ggf. nachbestellen.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr style="background:#f7f1e3;color:#7f7568;text-transform:uppercase;font-size:11px;letter-spacing:.12em;">
                <th style="padding:8px 12px;text-align:left;">Produkt</th>
                <th style="padding:8px 12px;text-align:left;">SKU</th>
                <th style="padding:8px 12px;text-align:right;">Bestand / Start</th>
                <th style="padding:8px 12px;text-align:right;">Anteil</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;

  try {
    console.log(`[MAIL] sendLowStockAlertMail -> to=${recipient} count=${products.length}`);
    const info = await mailer.sendMail({
      from: fromAddress,
      to: recipient,
      subject,
      text: `Lagerwarnung – ${products.length} Produkt(e) unter 20 %:\n\n${plainLines.join('\n')}`,
      html
    });
    await logEmail({
      recipient,
      subject,
      status: 'sent',
      provider_message: info.messageId || 'ok',
      related_type: 'low-stock-alert',
      related_id: null
    });
    return info;
  } catch (error) {
    console.log(`[MAIL] sendLowStockAlertMail failed -> ${error.message}`);
    await logEmail({
      recipient,
      subject,
      status: 'failed',
      provider_message: error.message,
      related_type: 'low-stock-alert',
      related_id: null
    });
    throw error;
  }
}

module.exports = { sendInvoiceMail, sendCustomerMail, sendOrderConfirmationMail, sendLowStockAlertMail };
