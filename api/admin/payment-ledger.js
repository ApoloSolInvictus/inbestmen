import { requireAdmin } from '../_lib/auth.js';
import { loadPaymentLedger } from '../_lib/payouts.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireAdmin(request, response)) return;
    try {
        response.status(200).json({ ok: true, ...(await loadPaymentLedger()) });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'The payment ledger could not be loaded.' });
    }
}
