import { requireUser, getRequestBodyText } from '../_lib/auth.js';
import { capturePayPalOrder, getPayPalOrder, getPayPalPublicConfig } from '../_lib/paypal.js';
import { creditUserWallet } from '../_lib/firestore.js';

const allowedAmounts = new Set([1, 2, 3, 5, 8, 13, 21]);

const getPurchaseUnit = (order) => order?.purchase_units?.[0] || null;
const getCapture = (order) => getPurchaseUnit(order)?.payments?.captures?.[0] || null;

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
    const claims = await requireUser(request, response);
    if (!claims) return;

    try {
        const bodyText = await getRequestBodyText(request);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const orderId = String(body.orderId || '').trim();
        if (!orderId || orderId.includes('/') || orderId.length > 80) return response.status(400).json({ error: 'A valid PayPal order is required.' });
        const userId = claims.user_id || claims.sub;
        const config = getPayPalPublicConfig();
        const initialOrder = await getPayPalOrder(orderId);
        const initialUnit = getPurchaseUnit(initialOrder);
        if (!initialUnit || initialUnit.custom_id !== userId) return response.status(403).json({ error: 'This PayPal order does not belong to the signed-in account.' });
        const amount = Number(initialUnit.amount?.value);
        if (!allowedAmounts.has(amount) || initialUnit.amount?.currency_code !== config.currency) return response.status(400).json({ error: 'The PayPal order amount or currency is not valid for iB Coins.' });

        const captureResponse = initialOrder.status === 'COMPLETED' ? initialOrder : await capturePayPalOrder(orderId);
        const capture = getCapture(captureResponse);
        if (captureResponse.status !== 'COMPLETED' || capture?.status !== 'COMPLETED') return response.status(409).json({ error: 'PayPal has not completed this payment yet.' });
        if (Number(capture.amount?.value) !== amount || capture.amount?.currency_code !== config.currency) return response.status(400).json({ error: 'The captured PayPal amount could not be verified.' });

        const walletResult = await creditUserWallet({ uid: userId, orderId, captureId: capture.id, amountUsd: amount, currency: config.currency, paypalStatus: capture.status });
        response.status(200).json({ ok: true, orderId, coins: amount, duplicate: walletResult.duplicate, wallet: walletResult.wallet });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'PayPal could not complete the purchase.' });
    }
}
