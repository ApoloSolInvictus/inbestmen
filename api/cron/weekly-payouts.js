import { loadPaymentLedger, submitProjectWeeklyPayout } from '../_lib/payouts.js';

const isAuthorized = (request) => {
    const expected = String(process.env.CRON_SECRET || '').trim();
    const supplied = request.headers?.get?.('authorization') || request.headers?.authorization || '';
    return expected && supplied === `Bearer ${expected}`;
};

export default async function handler(request, response) {
    if (!['GET', 'POST'].includes(request.method)) return response.status(405).json({ error: 'Method not allowed' });
    if (!isAuthorized(request)) return response.status(401).json({ error: 'Cron authorization is required.' });
    try {
        const ledger = await loadPaymentLedger();
        const results = [];
        for (const row of ledger.projects.filter((project) => project.payoutReady)) {
            try {
                results.push({ projectId: row.id, status: 'submitted', payout: await submitProjectWeeklyPayout(row, ledger.week) });
            } catch (error) {
                results.push({ projectId: row.id, status: 'failed', error: error.message || 'Payout failed.' });
            }
        }
        response.status(200).json({ ok: true, week: ledger.week, results });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'Weekly payouts could not be processed.' });
    }
}
