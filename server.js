require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const Razorpay = require('razorpay');

const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
const PORT = process.env.PORT || 3000;
const MIN_AMOUNT_PAISE = 100;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error('Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in environment (.env).');
  process.exit(1);
}

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

const app = express();

/**
 * POST /api/webhook
 * Razorpay server-to-server notifications (e.g. payment.captured, payment.failed).
 * Signature = HMAC_SHA256(raw request body, RAZORPAY_WEBHOOK_SECRET), sent in X-Razorpay-Signature.
 * Registered before express.json() because verification needs the raw, unparsed body.
 */
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.get('X-Razorpay-Signature');
  if (!signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing signature or body' });
  }

  const expected = crypto.createHmac('sha256', webhookSecret).update(req.body).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const payment = event.payload && event.payload.payment && event.payload.payment.entity;
  switch (event.event) {
    case 'payment.captured':
      // Source of truth for a successful payment: mark the order as paid here (idempotently).
      console.log(`Webhook: payment captured ${payment && payment.id} for order ${payment && payment.order_id}`);
      break;
    case 'payment.failed':
      console.log(`Webhook: payment failed ${payment && payment.id}: ${payment && payment.error_description}`);
      break;
    default:
      console.log(`Webhook: unhandled event ${event.event}`);
  }

  // Respond quickly with 2xx so Razorpay does not retry.
  return res.json({ status: 'ok' });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * POST /api/create-order
 * Body: { amount: <integer, paise>, currency?: 'INR', receipt?: string }
 * Returns: { order_id, amount, currency, key_id }
 */
app.post('/api/create-order', async (req, res) => {
  const { amount, currency = 'INR', receipt } = req.body || {};

  if (!Number.isInteger(amount) || amount < MIN_AMOUNT_PAISE) {
    return res.status(400).json({
      error: `amount must be an integer in paise and at least ${MIN_AMOUNT_PAISE}`,
    });
  }

  try {
    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
    });

    return res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      // Public key only; the secret never leaves the server.
      key_id: RAZORPAY_KEY_ID,
    });
  } catch (err) {
    const statusCode = err && err.statusCode;
    const description = (err && err.error && err.error.description) || 'Failed to create order';
    console.error('Razorpay order creation failed:', statusCode, description);

    if (statusCode === 401) {
      return res.status(401).json({ error: 'Razorpay authentication failed. Check API keys.' });
    }
    return res.status(500).json({ error: description });
  }
});

/**
 * POST /api/verify-payment
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Signature = HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)
 */
app.post('/api/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Missing payment verification fields' });
  }

  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(String(razorpay_signature), 'utf8');
  const isValid =
    expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);

  if (!isValid) {
    return res.status(400).json({ success: false, error: 'Invalid payment signature' });
  }

  // Signature verified: this is where you would mark the order as paid.
  return res.json({
    success: true,
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
