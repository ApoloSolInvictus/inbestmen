import { requireUser, getRequestBodyText } from '../_lib/auth.js';
import { createPayPalOrder, getPayPalPublicConfig } from '../_lib/paypal.js';

const allowedAmounts = new Set([1, 2, 3, 5, 8, 13, 21]);

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
    const claims = await requireUser(request, response);
    if (!claims) return;

    try {
        const bodyText = await getRequestBodyText(request);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const amount = Number(body.amount);
        if (!allowedAmounts.has(amount)) return response.status(400).json({ error: 'Choose one of the available iB Coin packages.' });
        const config = getPayPalPublicConfig();
        const order = await createPayPalOrder({ amount, uid: claims.user_id || claims.sub, currency: config.currency });
        if (!order.id) throw Object.assign(new Error('PayPal did not return an order id.'), { statusCode: 503 });
        response.status(200).json({ orderId: order.id, amount, currency: config.currency });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'PayPal could not create the order.' });
    }
}
