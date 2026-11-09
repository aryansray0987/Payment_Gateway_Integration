# Payment Gateway Integration — Razorpay Standard Checkout

Node.js + Express backend with a plain HTML/JS checkout page.

## Setup

```bash
npm install
cp .env.example .env   # then fill in your keys
npm start              # http://localhost:3000
```

### Environment variables

| Variable | Description |
|---|---|
| `RAZORPAY_KEY_ID` | Public key ID (sent to the browser via `/api/create-order`) |
| `RAZORPAY_KEY_SECRET` | Secret key — server only, never exposed to the frontend |
| `RAZORPAY_WEBHOOK_SECRET` | Secret configured on the webhook in the Razorpay Dashboard (optional) |
| `PORT` | Server port (default `3000`) |

## API

| Method & path | Body | Response |
|---|---|---|
| `POST /api/create-order` | `{ amount (paise, ≥100), currency?, receipt? }` | `{ order_id, amount, currency, key_id }` |
| `POST /api/verify-payment` | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | `{ success, order_id, payment_id }` or `400` |
| `POST /api/webhook` | Raw Razorpay webhook payload + `X-Razorpay-Signature` header | `{ status: "ok" }` or `400` |

## Payment flow

1. The user clicks **Pay Now**, and the page calls `/api/create-order`.
2. The Razorpay modal opens with the returned `order_id`.
3. On success, the page posts the three `razorpay_*` fields to `/api/verify-payment`.
4. The server checks `HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)` against the signature.
5. (Optional) Razorpay calls `/api/webhook` with `payment.captured`, even if the user closed the browser.

## Testing (test mode)

- Card: `4111 1111 1111 1111`, any future expiry, any CVV
- UPI: `success@razorpay` (success) / `failure@razorpay` (failure)

## Webhook setup

1. Razorpay Dashboard → **Account & Settings → Webhooks → Add New Webhook**.
2. URL: `https://<your-public-domain>/api/webhook` (use a tunnel such as ngrok for local testing).
3. Choose a secret, select the `payment.captured` and `payment.failed` events, and save.
4. Put the same secret in `RAZORPAY_WEBHOOK_SECRET` and restart the server.

## Going live

- Replace the test keys with live keys in `.env`.
- Persist orders/payments in a database at the marked spots in `server.js`, and make updates idempotent.
