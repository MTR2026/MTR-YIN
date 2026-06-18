// netlify/functions/create-payment-intent.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const TICKET_PRICES = {
  general:      3500,
  primera_fila: 5000,
  vip_cena:     7500,
};

const TICKET_NAMES = {
  general:      'General',
  primera_fila: 'Primera Fila',
  vip_cena:     'VIP + Cena',
};

exports.handler = async (event) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };

  try {
    const { ticket, qty, email, name, discount, promoCode } = JSON.parse(event.body);

    if (!ticket || !TICKET_PRICES[ticket])
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Tipo de entrada inválido' }) };

    const quantity = parseInt(qty, 10);
    if (!quantity || quantity < 1 || quantity > 10)
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cantidad inválida' }) };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email inválido' }) };

    // Verificar descuento en BD (seguridad — no hardcodeado)
    let discountPct = 0;
    const promoCodeUpper = promoCode ? promoCode.toUpperCase() : '';

    if (promoCodeUpper) {
      try {
        const res = await fetch(`${process.env.URL}/.netlify/functions/manage-discounts`);
        const data = await res.json();
        if (data.discounts && data.discounts[promoCodeUpper] !== undefined) {
          discountPct = data.discounts[promoCodeUpper];
        }
      } catch (e) {
        // Si falla la BD, usar el descuento que manda el frontend como fallback
        if (discount && typeof discount === 'number') discountPct = discount;
      }
    } else if (discount && typeof discount === 'number') {
      discountPct = discount;
    }

    const baseAmount = TICKET_PRICES[ticket] * quantity;
    const discountAmount = Math.round(baseAmount * discountPct / 100);
    const finalAmount = baseAmount - discountAmount;

    // Si es 100% descuento, no cobrar
    if (finalAmount === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ free: true, message: 'Entrada gratuita' }),
      };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalAmount,
      currency: 'eur',
      receipt_email: email,
      metadata: {
        ticket_type: ticket,
        ticket_name: TICKET_NAMES[ticket],
        quantity: String(quantity),
        buyer_name: name || '',
        buyer_email: email,
        discount_pct: String(discountPct),
        promo_code: promoCodeUpper,  // ✅ código promo guardado en Stripe
        event: 'MTR YIN — 21 Junio 2026 Madrid',
      },
      description: `MTR YIN — ${quantity}x ${TICKET_NAMES[ticket]}${discountPct > 0 ? ` (-${discountPct}%)` : ''}${promoCodeUpper ? ` [${promoCodeUpper}]` : ''}`,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
