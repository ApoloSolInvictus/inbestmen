import { requireAdmin, getRequestBodyText } from '../../_lib/auth.js';
import { loadPaymentLedger, submitProjectWeeklyPayout } from '../../_lib/payouts.js';

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
    const claims = await requireAdmin(request, response);
    if (!claims) return;
    try {
        const bodyText = await getRequestBodyText(request);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const ledger = await loadPaymentLedger();
        const row = ledger.projects.find((project) => project.id === String(body.projectId || '').trim());
        if (!row) return response.status(404).json({ error: 'That approved project is not available in the ledger.' });
        if (!row.payoutReady) return response.status(409).json({ error: 'This project is not ready for payout. Confirm its PayPal email, enable payouts and verify its weekly balance.' });
        const payout = await submitProjectWeeklyPayout(row, ledger.week);
        response.status(200).json({ ok: true, payout, submittedBy: claims.email || claims.user_id || claims.sub, week: ledger.week });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'The PayPal payout could not be submitted.' });
    }
}
