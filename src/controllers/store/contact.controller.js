const { loadStoreData, buildSeoMeta, buildBaseUrl, buildSeoBottomFromPage } = require('./home.controller');
const { listSettings } = require('../../services/settings.service');
const { getSeoPageBySlug } = require('../../services/seo.service');
const { sendCustomerMail } = require('../../services/email.service');
const { logEmail } = require('../../services/email-log.service');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function resolveSupportEmail() {
  try {
    const settings = await listSettings();
    const map = settings.reduce((acc, item) => {
      acc[item.key] = item.value || '';
      return acc;
    }, {});
    const fromSetting = String(map.support_email || '').trim();
    if (fromSetting && EMAIL_REGEX.test(fromSetting)) {
      return fromSetting;
    }
  } catch (_error) {
    // fall through to env fallback
  }

  const envFallback = String(process.env.SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const match = envFallback.match(/<([^>]+)>/);
  const address = match ? match[1].trim() : envFallback;
  return EMAIL_REGEX.test(address) ? address : 'admin@localhost';
}

async function renderContact(req, res, options = {}) {
  const [state, contactSeoPage] = await Promise.all([
    loadStoreData(),
    getSeoPageBySlug('kontakt').catch(() => null)
  ]);

  const form = options.form || { name: '', email: '', phone: '', subject: '', message: '' };
  const error = options.error || null;
  const success = options.success || null;

  const baseUrl = buildBaseUrl(req);
  const seoMeta = buildSeoMeta(req, contactSeoPage, {
    title: 'Kontakt | BarBae',
    meta_description:
      'Kontaktiere BarBae – wir helfen dir gerne bei Fragen zu Produkten, Bestellungen, Versand und Rückgabe.',
    canonical_url: `${baseUrl}/kontakt`,
    og_type: 'website'
  });

  const seoBottom = buildSeoBottomFromPage(contactSeoPage, {
    title: 'Wir sind für dich da',
    text:
      'Du hast Fragen zu BarBae, einer Bestellung oder einem Produkt? Schreib uns über das Kontaktformular oder direkt per E-Mail – wir melden uns so schnell wie möglich bei dir.',
    focusKeyword: 'kontakt'
  });

  return res.render('store/contact', {
    title: seoMeta.title || 'Kontakt | BarBae',
    query: '',
    menuMainCategories: state.menuMainCategories,
    menuSubcategories: state.menuSubcategories,
    searchItems: state.searchItems,
    form,
    error,
    success,
    seoMeta,
    seoBottom
  });
}

async function submitContact(req, res) {
  const body = req.body || {};
  const honeypot = String(body.website || '').trim();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();
  const privacy = body.privacy === 'on' || body.privacy === '1' || body.privacy === true;

  if (honeypot) {
    return renderContact(req, res, {
      form: { name, email, phone, subject, message },
      success: 'Danke, deine Nachricht wurde erfolgreich gesendet.'
    });
  }

  if (!name || name.length < 2) {
    return renderContact(req, res, {
      form: { name, email, phone, subject, message },
      error: 'Bitte gib deinen Namen an.'
    });
  }

  if (!EMAIL_REGEX.test(email)) {
    return renderContact(req, res, {
      form: { name, email, phone, subject, message },
      error: 'Bitte gib eine gültige E-Mail-Adresse an.'
    });
  }

  if (!message || message.length < 10) {
    return renderContact(req, res, {
      form: { name, email, phone, subject, message },
      error: 'Bitte schreib eine Nachricht (mindestens 10 Zeichen).'
    });
  }

  if (!privacy) {
    return renderContact(req, res, {
      form: { name, email, phone, subject, message },
      error: 'Bitte bestätige die Datenschutzhinweise, um die Nachricht zu senden.'
    });
  }

  const supportEmail = await resolveSupportEmail();
  const mailSubject = `Kontaktanfrage: ${subject || 'Neue Nachricht von ' + name}`;
  const plainText = [
    `Neue Kontaktanfrage über barbae.at`,
    ``,
    `Name:    ${name}`,
    `E-Mail:  ${email}`,
    phone ? `Telefon: ${phone}` : null,
    subject ? `Betreff: ${subject}` : null,
    ``,
    `Nachricht:`,
    message
  ]
    .filter(Boolean)
    .join('\n');

  const messageHtml = escapeHtml(message).replace(/\n/g, '<br>');
  const html = `
    <div style="margin:0;padding:24px;background:#f5f1e8;font-family:Montserrat,Arial,sans-serif;color:#2c261f;">
      <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e7dcc8">
        <div style="padding:18px 24px;background:linear-gradient(90deg,#2f221a,#d8be8d);color:#fff;">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;letter-spacing:.08em;">Bar<span style="color:#f2dcac;">Bae</span></div>
          <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.9;">Neue Kontaktanfrage</div>
        </div>
        <div style="padding:24px;">
          <h1 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;color:#2f221a;">${escapeHtml(subject || 'Kontaktanfrage')}</h1>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px;">
            <tr><td style="padding:4px 0;color:#7f7568;width:120px;">Name</td><td style="padding:4px 0;">${escapeHtml(name)}</td></tr>
            <tr><td style="padding:4px 0;color:#7f7568;">E-Mail</td><td style="padding:4px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
            ${phone ? `<tr><td style="padding:4px 0;color:#7f7568;">Telefon</td><td style="padding:4px 0;">${escapeHtml(phone)}</td></tr>` : ''}
          </table>
          <div style="border-top:1px solid #e7dcc8;padding-top:12px;line-height:1.6;">${messageHtml}</div>
        </div>
      </div>
    </div>`;

  try {
    await sendCustomerMail({
      to: supportEmail,
      subject: mailSubject,
      text: plainText,
      html,
      related_type: 'contact-form',
      related_id: null,
      replyTo: email
    });
  } catch (error) {
    try {
      await logEmail({
        recipient: supportEmail,
        subject: mailSubject,
        status: 'failed',
        provider_message: error?.message || 'send failed',
        related_type: 'contact-form',
        related_id: null
      });
    } catch (_logErr) {
      // ignore logging failure
    }

    return renderContact(req, res, {
      form: { name, email, phone, subject, message },
      error: 'Deine Nachricht konnte gerade nicht gesendet werden. Bitte versuche es später erneut oder schreib uns direkt eine E-Mail.'
    });
  }

  return renderContact(req, res, {
    form: { name: '', email: '', phone: '', subject: '', message: '' },
    success: 'Danke! Deine Nachricht ist bei uns angekommen – wir melden uns so schnell wie möglich.'
  });
}

module.exports = { renderContact, submitContact };
