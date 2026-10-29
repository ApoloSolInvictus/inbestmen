import { requireAdmin } from '../_lib/auth.js';
import { deleteAllProjectBriefs, setProjectSyncBaseline } from '../_lib/firestore.js';

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireAdmin(request, response)) return;

    const confirmation = request.body?.confirmation || request.body?.confirm || '';
    if (confirmation !== 'RESET') {
        return response.status(400).json({ error: 'Type RESET to confirm deletion of all stored project briefs.' });
    }

    try {
        const result = await deleteAllProjectBriefs();
        const resetAt = await setProjectSyncBaseline();
        response.status(200).json({ ok: true, ...result, resetAt });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'Stored project briefs could not be deleted.' });
    }
}
