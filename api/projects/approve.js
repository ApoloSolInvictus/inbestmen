import { requireAdmin, getRequestBodyText } from '../_lib/auth.js';
import { publishProjectBrief } from '../_lib/firestore.js';

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
    const claims = await requireAdmin(request, response);
    if (!claims) return;

    try {
        const bodyText = await getRequestBodyText(request);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const briefId = String(body.id || body.briefId || '').trim();
        if (!briefId) return response.status(400).json({ error: 'A project brief id is required.' });
        const result = await publishProjectBrief({ briefId, approvedBy: claims.email || claims.user_id || claims.sub || '' });
        response.status(200).json({ ok: true, ...result });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'The project could not be published.' });
    }
}
