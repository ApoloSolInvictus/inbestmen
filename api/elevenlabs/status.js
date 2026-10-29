import { requireAdmin } from '../_lib/auth.js';
import { fetchElevenLabs, getElevenLabsAgentId, sendError } from '../_lib/elevenlabs.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireAdmin(request, response)) return;
    try {
        const agentId = getElevenLabsAgentId();
        const agent = await fetchElevenLabs(`/convai/agents/${encodeURIComponent(agentId)}`);
        response.status(200).json({ ok: true, agentId, agentName: agent.name || agent.agent_name || 'Unnamed agent', agentStatus: agent.status || 'available', checkedAt: new Date().toISOString() });
    } catch (error) { sendError(response, error); }
}
