import crypto from 'node:crypto';
import { getRequestBodyText } from '../_lib/auth.js';
import { getElevenLabsAgentId } from '../_lib/elevenlabs.js';
import { storeProjectBrief } from '../_lib/firestore.js';
import { buildProjectBrief } from '../_lib/project-brief.js';

export const config = { api: { bodyParser: false } };

const getHeader = (request, name) => request.headers?.get ? request.headers.get(name) : request.headers?.[name] || request.headers?.[name.toLowerCase()];

const verifySignature = (rawBody, signature, secret) => {
    const values = Object.fromEntries(String(signature || '').split(',').map((part) => part.split('=').map((item) => item.trim())).filter(([key, value]) => key && value));
    const timestamp = Number(values.t);
    if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 1800 || !values.v0) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const actual = Buffer.from(values.v0, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
};

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
    const secret = process.env.ELEVENLABS_WEBHOOK_SECRET || process.env.ELEVENLABS_POST_CALL_WEBHOOK_SECRET;
    if (!secret) return response.status(503).json({ error: 'ElevenLabs webhook secret is not configured in Vercel.' });

    const rawBody = await getRequestBodyText(request);
    if (!verifySignature(rawBody, getHeader(request, 'elevenlabs-signature'), secret)) return response.status(401).json({ error: 'Invalid or expired ElevenLabs webhook signature.' });

    let event;
    try { event = JSON.parse(rawBody); } catch (_error) { return response.status(400).json({ error: 'Webhook body must be valid JSON.' }); }
    const eventType = event.type;
    if (eventType !== 'post_call_transcription') return response.status(200).json({ ok: true, ignored: eventType || 'unknown' });

    const data = event.data || {};
    if (data.agent_id && data.agent_id !== getElevenLabsAgentId()) return response.status(403).json({ error: 'Webhook belongs to an unapproved ElevenLabs agent.' });
    const brief = buildProjectBrief(event);
    if (!brief.conversationId) return response.status(400).json({ error: 'The webhook does not include a conversation id.' });

    try {
        const stored = await storeProjectBrief(brief);
        response.status(200).json({ ok: true, eventType, conversationId: brief.conversationId, status: brief.status, stored });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'The project brief could not be stored.' });
    }
}
