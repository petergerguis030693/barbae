const nodemailer = require('nodemailer');

function createTransporter() {
  if (!process.env.SMTP_HOST) {
    console.log('[MAILER] Using jsonTransport (SMTP_HOST is empty) - no real emails will be sent.');
    return nodemailer.createTransport({ jsonTransport: true });
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
  console.log(
    `[MAILER] SMTP enabled host=${host} port=${port} secure=${secure} user=${process.env.SMTP_USER ? process.env.SMTP_USER : '(none)'}`
  );

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined
  });
}

const transporter = createTransporter();

if (process.env.SMTP_HOST && typeof transporter.verify === 'function') {
  transporter
    .verify()
    .then(() => {
      console.log('[MAILER] SMTP verify success - transporter is ready.');
    })
    .catch((error) => {
      console.log(`[MAILER] SMTP verify failed - ${error.message}`);
    });
}

module.exports = transporter;
