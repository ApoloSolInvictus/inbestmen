import { requireAdmin, getRequestBodyText } from '../_lib/auth.js';
import { addIgnoredProjectBriefId, deleteProjectBrief } from '../_lib/firestore.js';

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireAdmin(request, response)) return;

    try {
        const bodyText = await getRequestBodyText(request);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const id = String(body.id || '').trim();
        if (body.confirmation !== 'DELETE') return response.status(400).json({ error: 'Type DELETE to remove this stored project brief.' });
        if (!id || id.includes('/') || id.length > 150) return response.status(400).json({ error: 'A valid project brief id is required.' });

        const result = await deleteProjectBrief(id);
        await addIgnoredProjectBriefId(id);
        response.status(200).json({ ok: true, id, ...result });
    } catch (error) {
        response.status(error.statusCode || 400).json({ error: error.message || 'The project brief could not be removed.' });
    }
}
