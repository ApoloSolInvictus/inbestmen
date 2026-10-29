import { requireAdmin } from '../_lib/auth.js';
import { fetchElevenLabs, getElevenLabsAgentId, sendError } from '../_lib/elevenlabs.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireAdmin(request, response)) return;
    try {
        const agent = await fetchElevenLabs(`/convai/agents/${encodeURIComponent(getElevenLabsAgentId())}`);
        response.status(200).json({ agent });
    } catch (error) { sendError(response, error); }
}
