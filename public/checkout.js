(function () {
  const payBtn = document.getElementById('pay-btn');
  const amountInput = document.getElementById('amount');
  const messageEl = document.getElementById('message');

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = type;
  }

  function setLoading(isLoading) {
    payBtn.disabled = isLoading;
    payBtn.textContent = isLoading ? 'Processing...' : 'Pay Now';
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  async function verifyPayment(response) {
    try {
      showMessage('Verifying payment...', 'info');
      const result = await postJSON('/api/verify-payment', {
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
      });
      showMessage(`Payment successful! Payment ID: ${result.payment_id}`, 'success');
    } catch (err) {
      showMessage(`Payment verification failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  payBtn.addEventListener('click', async () => {
    const rupees = parseFloat(amountInput.value);
    const amount = Math.round(rupees * 100); // convert to paise

    if (!Number.isFinite(amount) || amount < 100) {
      showMessage('Please enter an amount of at least ₹1.00', 'error');
      return;
    }

    if (typeof window.Razorpay === 'undefined') {
      showMessage('Razorpay SDK failed to load. Check your internet connection.', 'error');
      return;
    }

    setLoading(true);
    showMessage('', '');

    let order;
    try {
      order = await postJSON('/api/create-order', { amount, currency: 'INR' });
    } catch (err) {
      showMessage(`Could not create order: ${err.message}`, 'error');
      setLoading(false);
      return;
    }

    const options = {
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: 'Payment Gateway Integration',
      description: 'Test Transaction',
      handler: verifyPayment,
      prefill: {},
      theme: { color: '#3399cc' },
      modal: {
        ondismiss: function () {
          showMessage('Payment cancelled.', 'error');
          setLoading(false);
        },
      },
    };

    const rzp = new window.Razorpay(options);

    rzp.on('payment.failed', function (response) {
      const e = response.error || {};
      showMessage(
        `Payment failed: ${e.description || 'Unknown error'}${e.reason ? ` (${e.reason})` : ''}`,
        'error'
      );
      setLoading(false);
    });

    rzp.open();
  });
})();
