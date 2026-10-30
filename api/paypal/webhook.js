import { getRequestBodyText } from '../_lib/auth.js';
import { markProjectPayoutStatus } from '../_lib/firestore.js';
import { verifyPayPalWebhookSignature } from '../_lib/paypal.js';
import { loadPaymentLedger } from '../_lib/payouts.js';

const getHeader = (request, name) => request.headers?.get?.(name) || request.headers?.[name] || request.headers?.[name.toLowerCase()] || '';

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
    try {
        const rawBody = await getRequestBodyText(request);
        const event = rawBody ? JSON.parse(rawBody) : {};
        const headers = { get: (name) => getHeader(request, name) };
        if (!await verifyPayPalWebhookSignature({ headers, webhookEvent: event })) return response.status(401).json({ error: 'Invalid PayPal webhook signature.' });

        const eventType = String(event.event_type || '').toUpperCase();
        const resource = event.resource || {};
        const itemStatus = eventType.includes('SUCCEEDED') ? 'SUCCEEDED' : eventType.includes('FAILED') ? 'FAILED' : eventType.includes('DENIED') ? 'FAILED' : eventType.includes('CANCELED') ? 'CANCELED' : eventType.includes('RETURNED') ? 'RETURNED' : eventType.includes('REFUNDED') ? 'REFUNDED' : eventType.includes('UNCLAIMED') ? 'UNCLAIMED' : eventType.includes('BLOCKED') ? 'BLOCKED' : eventType.includes('HELD') ? 'HELD' : eventType.includes('PROCESSING') ? 'PROCESSING' : '';
        const itemId = resource.sender_item_id || resource.payout_item_id || '';
        if (itemId && itemStatus) {
            await markProjectPayoutStatus({ payoutId: itemId, status: itemStatus, paypalBatchId: resource.payout_batch_id || '', paypalItemId: resource.payout_item_id || '', failureReason: resource.errors?.[0]?.message || '' });
        } else if (eventType.includes('PAYOUTSBATCH') && resource.payout_batch_id) {
            const ledger = await loadPaymentLedger();
            const matching = ledger.payouts.filter((payout) => payout.paypalBatchId === resource.payout_batch_id);
            const status = eventType.includes('SUCCESS') ? 'SUCCEEDED' : eventType.includes('DENIED') ? 'FAILED' : 'PROCESSING';
            for (const payout of matching) await markProjectPayoutStatus({ payoutId: payout.id, status, paypalBatchId: resource.payout_batch_id });
        }
        response.status(200).json({ ok: true, eventId: event.id || null, handled: Boolean(itemId || resource.payout_batch_id) });
    } catch (error) {
        response.status(error.statusCode || 500).json({ error: error.message || 'PayPal webhook processing failed.' });
    }
}
