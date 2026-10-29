import { requireAdmin } from '../_lib/auth.js';
import { fetchElevenLabs, getElevenLabsAgentId, sendError } from '../_lib/elevenlabs.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireAdmin(request, response)) return;
    try {
        const params = new URLSearchParams({ agent_id: getElevenLabsAgentId(), page_size: String(Math.min(100, Math.max(1, Number(request.query?.page_size || 20)))), summary_mode: 'include', sort_direction: 'desc' });
        const cursor = request.query?.cursor;
        const collectionIds = String(process.env.ELEVENLABS_PROJECT_DATA_COLLECTION_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);
        if (cursor) params.set('cursor', cursor);
        collectionIds.forEach((id) => params.append('data_collection_ids', id));
        const data = await fetchElevenLabs(`/convai/conversations?${params.toString()}`);
        response.status(200).json({ ...data, agentId: getElevenLabsAgentId() });
    } catch (error) { sendError(response, error); }
}
