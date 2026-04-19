const { sendCustomerMail } = require('../../services/email.service');
const {
  listCustomersForMessaging,
  listNewsletterRecipients,
  createCustomerMessage,
  listRecentCustomerMessages
} = require('../../services/customer-message.service');

function nl2html(text) {
  const safe = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return safe
    .split(/\r?\n\r?\n/)
    .map((block) => `<p>${block.replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

function renderBrandedMailHtml(subject, contentHtml) {
  return `
    <div style="margin:0;padding:24px;background:#f5f1e8;font-family:Montserrat,Arial,sans-serif;color:#2c261f;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e7dcc8;">
        <div style="padding:20px 24px;background:linear-gradient(90deg,#2f221a,#d8be8d);color:#fff;">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;letter-spacing:.08em;">
            Bar<span style="color:#f2dcac;">Bae</span>
          </div>
          <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.9;">Kunden Nachricht</div>
        </div>
        <div style="padding:24px;">
          <h1 style="margin:0 0 14px;font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;color:#2f221a;">${String(subject || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
          <div style="font-size:15px;line-height:1.65;color:#3f372f;">${contentHtml}</div>
          <div style="margin-top:20px;padding-top:14px;border-top:1px solid #eee3d2;font-size:12px;color:#807669;">
            Du siehst diese Nachricht auch in deinem Kundenkonto unter /account.
          </div>
        </div>
      </div>
    </div>`;
}

async function index(req, res) {
  const [customers, recentMessages] = await Promise.all([listCustomersForMessaging(), listRecentCustomerMessages(80)]);
  const flash = req.session.adminCustomerMessageFlash || null;
  req.session.adminCustomerMessageFlash = null;

  res.render('layouts/admin', {
    title: 'Kunden Nachrichten',
    activeMenu: 'customer-messages',
    body: 'customer-messages',
    data: { customers, recentMessages, flash }
  });
}

async function sendSingle(req, res) {
  const customerId = Number(req.body.customer_id);
  const subject = String(req.body.subject || '').trim();
  const bodyText = String(req.body.body_text || '').trim();
  const sendEmail = String(req.body.send_email || '') === '1';

  const customers = await listCustomersForMessaging();
  const customer = customers.find((c) => Number(c.id) === customerId);
  if (!customer || !subject || !bodyText) {
    req.session.adminCustomerMessageFlash = { type: 'danger', text: 'Bitte Kunde, Betreff und Nachricht ausfüllen.' };
    return res.redirect('/admin/customer-messages');
  }

  await createCustomerMessage({
    customerId,
    kind: 'message',
    subject,
    bodyText,
    bodyHtml: nl2html(bodyText),
    sentViaEmail: sendEmail
  });

  if (sendEmail && customer.email) {
    try {
      await sendCustomerMail({
        to: customer.email,
        subject,
        text: bodyText,
        html: renderBrandedMailHtml(subject, nl2html(bodyText)),
        related_type: 'customer-message',
        related_id: customerId
      });
    } catch (_error) {
      req.session.adminCustomerMessageFlash = { type: 'warning', text: 'In-App Nachricht gespeichert, E-Mail Versand fehlgeschlagen (siehe E-Mail-Logs).' };
      return res.redirect('/admin/customer-messages');
    }
  }

  req.session.adminCustomerMessageFlash = { type: 'success', text: 'Nachricht wurde versendet.' };
  return res.redirect('/admin/customer-messages');
}

async function sendNewsletter(req, res) {
  const subject = String(req.body.subject || '').trim();
  const bodyText = String(req.body.body_text || '').trim();
  const sendEmail = String(req.body.send_email || '1') === '1';
  if (!subject || !bodyText) {
    req.session.adminCustomerMessageFlash = { type: 'danger', text: 'Newsletter benötigt Betreff und Inhalt.' };
    return res.redirect('/admin/customer-messages');
  }

  const recipients = await listNewsletterRecipients();
  let sentCount = 0;
  let failCount = 0;

  for (const customer of recipients) {
    await createCustomerMessage({
      customerId: customer.id,
      kind: 'newsletter',
      subject,
      bodyText,
      bodyHtml: nl2html(bodyText),
      sentViaEmail: sendEmail
    });

    if (sendEmail && customer.email) {
      try {
        await sendCustomerMail({
          to: customer.email,
          subject,
          text: bodyText,
          html: renderBrandedMailHtml(subject, nl2html(bodyText)),
          related_type: 'newsletter',
          related_id: customer.id
        });
        sentCount += 1;
      } catch (_error) {
        failCount += 1;
      }
    } else {
      sentCount += 1;
    }
  }

  req.session.adminCustomerMessageFlash = {
    type: failCount ? 'warning' : 'success',
    text: `Newsletter verarbeitet. Empfänger: ${recipients.length}, erfolgreich: ${sentCount}, fehlgeschlagen: ${failCount}.`
  };
  return res.redirect('/admin/customer-messages');
}

module.exports = {
  index,
  sendSingle,
  sendNewsletter
};
