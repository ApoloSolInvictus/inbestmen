import { requireAdmin } from '../_lib/auth.js';
import { fetchElevenLabs, getElevenLabsAgentId } from '../_lib/elevenlabs.js';
import { listProjectDocuments } from '../_lib/firestore.js';
import { verifyPayPalConnection } from '../_lib/paypal.js';

const check = async (key, runner) => {
    try {
        return [key, { status: 'operational', ...await runner() }];
    } catch (error) {
        return [key, { status: 'error', message: error.message || 'The check could not be completed.' }];
    }
};

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    const claims = await requireAdmin(request, response);
    if (!claims) return;

    const checks = Object.fromEntries(await Promise.all([
        check('firebaseAuth', async () => ({ message: 'Approved admin session verified.' })),
        check('elevenlabs', async () => {
            const agentId = getElevenLabsAgentId();
            const agent = await fetchElevenLabs(`/convai/agents/${encodeURIComponent(agentId)}`);
            return { message: agent.name || agent.agent_name || 'ElevenLabs intake agent available.', agentId };
        }),
        check('elevenlabsWebhook', async () => {
            if (!process.env.ELEVENLABS_WEBHOOK_SECRET && !process.env.ELEVENLABS_POST_CALL_WEBHOOK_SECRET) throw new Error('Webhook signing secret is not configured.');
            return { message: 'Signed post-call webhook is configured.' };
        }),
        check('paypal', async () => {
            const result = await verifyPayPalConnection();
            return { message: `PayPal ${result.environment} credentials verified (${result.currency}).`, environment: result.environment, currency: result.currency };
        }),
        check('paypalWebhook', async () => {
            if (!process.env.PAYPAL_WEBHOOK_ID) throw new Error('PAYPAL_WEBHOOK_ID is not configured.');
            return { message: 'PayPal payout webhook verification is configured.' };
        }),
        check('weeklyScheduler', async () => {
            if (!process.env.CRON_SECRET) throw new Error('CRON_SECRET is not configured.');
            return { message: 'Monday payout scheduler is protected and configured.' };
        }),
        check('openai', async () => {
            if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
            return { message: 'OpenAI screening credentials are configured.' };
        }),
        check('projectPublishing', async () => {
            const projects = await listProjectDocuments(100);
            const published = projects.filter((project) => project.approved === true && project.approvedBriefId).length;
            return { message: `Firestore project publishing is ready. ${published} published project${published === 1 ? '' : 's'}.`, publishedProjects: published };
        })
    ]));

    const ok = Object.values(checks).every((item) => item.status === 'operational');
    response.status(200).json({ ok, checkedAt: new Date().toISOString(), checks });
}
