import { requireAdmin } from '../_lib/auth.js';
import { fetchElevenLabs, getElevenLabsAgentId } from '../_lib/elevenlabs.js';
import { storeProjectBrief, listProjectBriefs } from '../_lib/firestore.js';
import { screenProjectBrief } from '../_lib/openai.js';
import { buildProjectBrief } from '../_lib/project-brief.js';

const cleanId = (value) => String(value || '').trim();

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireAdmin(request, response)) return;

    const limit = Math.min(10, Math.max(1, Number(request.query?.limit || 10)));

    try {
        const [conversationPage, storedBriefs] = await Promise.all([
            fetchElevenLabs(`/convai/conversations?${new URLSearchParams({ agent_id: getElevenLabsAgentId(), page_size: String(limit), summary_mode: 'include', sort_direction: 'desc' })}`),
            listProjectBriefs(100)
        ]);
        const storedIds = new Set(storedBriefs.map((brief) => cleanId(brief.conversationId)).filter(Boolean));
        const conversations = conversationPage.conversations || [];
        const results = [];

        for (const item of conversations) {
            const conversationId = cleanId(item.conversation_id || item.id);
            if (!conversationId) {
                results.push({ status: 'skipped', reason: 'missing_conversation_id' });
                continue;
            }
            if (storedIds.has(conversationId)) {
                results.push({ conversationId, status: 'already_stored' });
                continue;
            }

            try {
                const detailResponse = await fetchElevenLabs(`/convai/conversations/${encodeURIComponent(conversationId)}`);
                const conversation = detailResponse.conversation || detailResponse;
                const event = {
                    type: 'post_call_transcription',
                    event_timestamp: conversation.end_time_unix_secs || conversation.start_time_unix_secs || Math.floor(Date.now() / 1000),
                    data: { ...item, ...conversation, conversation_id: conversation.conversation_id || conversationId }
                };
                const brief = buildProjectBrief(event);
                const screenedBrief = await screenProjectBrief(brief);
                const stored = await storeProjectBrief(screenedBrief);
                storedIds.add(conversationId);
                results.push({ conversationId, status: screenedBrief.status, projectName: screenedBrief.project?.name || '', stored });
            } catch (error) {
                results.push({ conversationId, status: 'failed', error: error.message || 'Could not synchronize conversation.' });
            }
        }

        response.status(200).json({ ok: true, agentId: getElevenLabsAgentId(), requested: conversations.length, results });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'Recent ElevenLabs conversations could not be synchronized.' });
    }
}
