const Stripe = require('stripe');
const { query } = require('../../config/db');
const { listSettings } = require('../../services/settings.service');
const { createOrRefreshInvoice, getInvoiceById } = require('../../services/invoice.service');
const { sendInvoiceMail, sendOrderConfirmationMail } = require('../../services/email.service');
const { markCouponUsedByCode } = require('../../services/coupon.service');

function toSettingsMap(rows = []) {
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value || '';
    return acc;
  }, {});
}

async function findOrderWithCustomer(orderId) {
  const rows = await query(
    `SELECT o.id, o.order_number, o.status, o.total_amount, o.currency, o.discount_code,
            c.email AS customer_email, c.first_name, c.last_name
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.id = ?
     LIMIT 1`,
    [Number(orderId)]
  );
  return rows[0] || null;
}

async function markOrderPaid(orderId) {
  await query("UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = ? AND status <> 'paid'", [Number(orderId)]);
}

async function processCheckoutCompleted(sessionObject) {
  if (String(sessionObject?.payment_status || '').toLowerCase() !== 'paid') return;
  const orderId = Number(sessionObject?.metadata?.order_id || 0);
  console.log(`[STRIPE-WEBHOOK] checkout.session.completed payment_status=${sessionObject?.payment_status || '-'} orderId=${orderId || 0}`);
  if (!orderId) return;
  const order = await findOrderWithCustomer(orderId);
  if (!order) return;

  const wasPaid = String(order.status || '').toLowerCase() === 'paid';
  if (!wasPaid) {
    await markOrderPaid(orderId);
  }

  // Send transactional notifications only once, right after first successful payment.
  if (!wasPaid) {
    try {
      await sendOrderConfirmationMail({
        orderId: order.id,
        orderNumber: order.order_number,
        customerEmail: order.customer_email,
        customerName: `${order.first_name || ''} ${order.last_name || ''}`.trim(),
        totalAmount: Number(order.total_amount || 0),
        currency: order.currency || 'EUR'
      });
    } catch (_error) {
      // keep webhook idempotent and non-blocking for Stripe retries
    }

    try {
      const generated = await createOrRefreshInvoice(order.id);
      const invoiceForMail = await getInvoiceById(generated.invoice.id);
      if (invoiceForMail) {
        await sendInvoiceMail(invoiceForMail);
      }
    } catch (_error) {
      // keep webhook idempotent and non-blocking for Stripe retries
    }

    try {
      await markCouponUsedByCode(order.discount_code || '');
    } catch (_error) {
      // do not fail webhook completion due to coupon counter issues
    }
  }
}

async function handleStripeWebhook(req, res) {
  const settingsRows = await listSettings();
  const settingsMap = toSettingsMap(settingsRows);
  const stripeSecretKey = String(settingsMap.stripe_secret_key || '').trim();
  const stripeWebhookSecret = String(settingsMap.stripe_webhook_secret || '').trim();

  if (!stripeSecretKey || !stripeWebhookSecret) {
    console.log('[STRIPE-WEBHOOK] missing stripe configuration (secret/webhook secret)');
    return res.status(400).send('stripe-webhook-not-configured');
  }

  const stripe = new Stripe(stripeSecretKey);
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
  } catch (_error) {
    console.log('[STRIPE-WEBHOOK] invalid signature');
    return res.status(400).send('invalid-signature');
  }

  console.log(`[STRIPE-WEBHOOK] event received type=${event.type}`);

  if (event.type === 'checkout.session.completed') {
    await processCheckoutCompleted(event.data.object);
  }

  return res.json({ received: true });
}

module.exports = { handleStripeWebhook };
