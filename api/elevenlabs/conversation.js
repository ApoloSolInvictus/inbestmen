import { requireAdmin } from '../_lib/auth.js';
import { fetchElevenLabs, sendError } from '../_lib/elevenlabs.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireAdmin(request, response)) return;
    const conversationId = String(request.query?.id || '').trim();
    if (!conversationId) return response.status(400).json({ error: 'A conversation id is required.' });
    try {
        const conversation = await fetchElevenLabs(`/convai/conversations/${encodeURIComponent(conversationId)}`);
        response.status(200).json({ conversation });
    } catch (error) { sendError(response, error); }
}
