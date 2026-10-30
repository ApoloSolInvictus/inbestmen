import { createProjectPayoutDocument, listProjectDocuments, listProjectDonationDocuments, listProjectPayoutDocuments, markProjectPayoutStatus, updateProjectPayoutDocument } from './firestore.js';
import { createPayPalPayout, getPayPalPayoutBatch } from './paypal.js';
import { createHash } from 'node:crypto';

const NON_SETTLED_STATUSES = new Set(['FAILED', 'CANCELED', 'CANCELLED', 'RETURNED', 'REFUNDED']);
const PAID_STATUSES = new Set(['SUCCEEDED', 'COMPLETED']);

export const getClosedWeekRange = (referenceDate = new Date()) => {
    const end = new Date(referenceDate);
    end.setUTCHours(0, 0, 0, 0);
    const daysSinceMonday = (end.getUTCDay() + 6) % 7;
    end.setUTCDate(end.getUTCDate() - daysSinceMonday);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
    return { start: start.toISOString(), end: end.toISOString(), label: `${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}` };
};

const sum = (items, selector) => items.reduce((total, item) => total + Math.max(0, Number(selector(item) || 0)), 0);
const inRange = (value, start, end) => { const timestamp = Date.parse(value || ''); return Number.isFinite(timestamp) && timestamp >= Date.parse(start) && timestamp < Date.parse(end); };

export const loadPaymentLedger = async (referenceDate = new Date()) => {
    const [projects, donations, payouts] = await Promise.all([listProjectDocuments(100), listProjectDonationDocuments(1000), listProjectPayoutDocuments(1000)]);
    const week = getClosedWeekRange(referenceDate);
    const rows = projects.filter((project) => project.approved === true && project.approvedBriefId).map((project) => {
        const projectDonations = donations.filter((donation) => donation.projectId === project.id && String(donation.status || 'COMPLETED').toUpperCase() === 'COMPLETED');
        const projectPayouts = payouts.filter((payout) => payout.projectId === project.id);
        const paidPayouts = projectPayouts.filter((payout) => PAID_STATUSES.has(String(payout.status || '').toUpperCase()));
        const reservedPayouts = projectPayouts.filter((payout) => !NON_SETTLED_STATUSES.has(String(payout.status || '').toUpperCase()));
        const weeklyDonationsIb = sum(projectDonations.filter((donation) => inRange(donation.createdAt, week.start, week.end)), (donation) => donation.amountIb);
        const eligibleDonationsIb = sum(projectDonations.filter((donation) => { const timestamp = Date.parse(donation.createdAt || ''); return Number.isFinite(timestamp) && timestamp < Date.parse(week.end); }), (donation) => donation.amountIb);
        const totalDonatedIb = sum(projectDonations, (donation) => donation.amountIb);
        const totalPaidIb = sum(paidPayouts, (payout) => payout.amountIb);
        const pendingPayoutIb = sum(reservedPayouts.filter((payout) => !PAID_STATUSES.has(String(payout.status || '').toUpperCase())), (payout) => payout.amountIb);
        const goalIb = Math.max(0, Number(project.ibGoal || 0));
        const goalRemainingIb = Math.max(0, goalIb - totalPaidIb - pendingPayoutIb);
        const unpaidEligibleIb = Math.max(0, eligibleDonationsIb - totalPaidIb - pendingPayoutIb);
        const weeklyDueIb = Math.max(0, Math.min(unpaidEligibleIb, goalRemainingIb));
        return {
            ...project,
            paypalRecipientEmail: project.paypalRecipientEmail || '',
            paypalAccountConfirmed: project.paypalAccountConfirmed === true,
            payoutsEnabled: project.payoutsEnabled === true,
            weeklyDonationsIb,
            eligibleDonationsIb,
            unpaidEligibleIb,
            weeklyDueIb,
            totalDonatedIb,
            totalPaidIb,
            pendingPayoutIb,
            goalRemainingIb,
            payoutStatus: projectPayouts[projectPayouts.length - 1]?.status || 'NOT_STARTED',
            payoutReady: weeklyDueIb > 0 && Boolean(project.paypalRecipientEmail) && project.paypalAccountConfirmed === true && project.payoutsEnabled === true
        };
    });
    const summary = {
        grossContributionsIb: sum(rows, (row) => row.totalDonatedIb),
        payoutsDueIb: sum(rows, (row) => row.weeklyDueIb),
        pendingPayoutsIb: sum(rows, (row) => row.pendingPayoutIb),
        paidOutIb: sum(rows, (row) => row.totalPaidIb),
        projectsWithAccounts: rows.filter((row) => row.paypalRecipientEmail).length,
        reconciledEvents: donations.length + payouts.length
    };
    return { week, summary, projects: rows, payouts };
};

export const submitProjectWeeklyPayout = async (row, week) => {
    if (!row.payoutReady) throw Object.assign(new Error('This project needs a confirmed PayPal email, enabled payouts and a positive weekly balance.'), { statusCode: 409 });
    const payoutId = `${row.id}-${week.start.slice(0, 10)}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 150);
    const amount = Number(row.weeklyDueIb);
    const senderItemId = `ib-item-${createHash('sha256').update(payoutId).digest('hex').slice(0, 48)}`;
    const record = { id: payoutId, projectId: row.id, recipientEmail: row.paypalRecipientEmail, amountIb: amount, amountUsd: amount, currency: 'USD', periodStart: week.start, periodEnd: week.end, status: 'PENDING', senderBatchId: payoutId, senderItemId, createdAt: new Date().toISOString() };
    try {
        await createProjectPayoutDocument(record);
    } catch (error) {
        if (error.statusCode !== 409) throw error;
        const existing = (await loadPaymentLedger()).payouts.find((payout) => payout.id === payoutId);
        if (existing && !NON_SETTLED_STATUSES.has(String(existing.status || '').toUpperCase())) return existing;
        throw error;
    }
    let paypalResponse;
    try {
        paypalResponse = await createPayPalPayout({ senderBatchId: payoutId, senderItemId: payoutId, receiver: row.paypalRecipientEmail, amount, note: `Weekly support for ${row.name} (${week.label}).` });
    } catch (error) {
        await updateProjectPayoutDocument(payoutId, { status: 'FAILED', failureReason: error.message || 'PayPal payout request failed.' });
        throw error;
    }
    const batchHeader = paypalResponse.batch_header || {};
    const batchStatus = String(batchHeader.batch_status || 'PROCESSING').toUpperCase();
    const itemStatus = String(paypalResponse.items?.[0]?.transaction_status || '').toUpperCase();
    const payoutStatus = ['DENIED', 'FAILED', 'CANCELED', 'CANCELLED'].includes(batchStatus) || ['FAILED', 'CANCELED', 'CANCELLED', 'RETURNED'].includes(itemStatus) ? 'FAILED' : itemStatus === 'SUCCESS' ? 'SUCCEEDED' : 'PROCESSING';
    const payoutUpdate = { status: payoutStatus, paypalBatchId: batchHeader.payout_batch_id || '', paypalItemId: paypalResponse.items?.[0]?.payout_item_id || '', submittedAt: new Date().toISOString() };
    if (payoutStatus === 'SUCCEEDED') return markProjectPayoutStatus({ payoutId, status: 'SUCCEEDED', paypalBatchId: payoutUpdate.paypalBatchId, paypalItemId: payoutUpdate.paypalItemId });
    return updateProjectPayoutDocument(payoutId, payoutUpdate);
};

export const reconcilePayPalPayout = async (payoutId, batchId) => {
    const batch = await getPayPalPayoutBatch(batchId);
    const status = String(batch.batch_header?.batch_status || '').toUpperCase();
    if (status === 'SUCCESS') return markProjectPayoutStatus({ payoutId, status: 'SUCCEEDED', paypalBatchId: batchId, paypalItemId: batch.items?.[0]?.payout_item_id || '' });
    if (['DENIED', 'CANCELED', 'CANCELLED'].includes(status)) return markProjectPayoutStatus({ payoutId, status, paypalBatchId: batchId, failureReason: `PayPal batch status: ${status}` });
    return markProjectPayoutStatus({ payoutId, status: status || 'PROCESSING', paypalBatchId: batchId });
};
