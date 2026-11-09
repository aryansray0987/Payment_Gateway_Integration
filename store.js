/**
 * Minimal JSON-file store for orders and payments (no database).
 * Data lives in data/orders.json, keyed by Razorpay order_id.
 * Uses synchronous I/O so each read-modify-write runs without interleaving,
 * and writes via a temp file + rename so the file is never left half-written.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'orders.json');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function writeAll(orders) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(orders, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function update(orderId, changes) {
  const orders = readAll();
  const now = new Date().toISOString();
  const existing = orders[orderId] || { order_id: orderId, created_at: now };
  orders[orderId] = { ...existing, ...changes, updated_at: now };
  writeAll(orders);
  return orders[orderId];
}

function createOrder({ order_id, amount, currency, receipt }) {
  return update(order_id, { amount, currency, receipt, status: 'created' });
}

/** Marks an order as paid. Idempotent: repeated calls keep the first paid_at. */
function markPaid(orderId, paymentId, source) {
  const current = readAll()[orderId];
  if (current && current.status === 'paid') {
    return current;
  }
  return update(orderId, {
    status: 'paid',
    payment_id: paymentId,
    paid_at: new Date().toISOString(),
    paid_via: source,
  });
}

/** Records a failed attempt, but never downgrades an order that is already paid. */
function markFailed(orderId, paymentId, reason) {
  const current = readAll()[orderId];
  if (current && current.status === 'paid') {
    return current;
  }
  return update(orderId, { status: 'failed', payment_id: paymentId, failure_reason: reason });
}

function getOrder(orderId) {
  return readAll()[orderId] || null;
}

module.exports = { createOrder, markPaid, markFailed, getOrder };
