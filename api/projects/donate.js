import { requireUser, getRequestBodyText } from '../_lib/auth.js';
import { creditProjectDonation, listProjectDocuments } from '../_lib/firestore.js';

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
    const claims = await requireUser(request, response);
    if (!claims) return;
    try {
        const bodyText = await getRequestBodyText(request);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const projectId = String(body.projectId || '').trim();
        const storedProjects = await listProjectDocuments(100);
        const project = storedProjects.find((item) => String(item.id) === projectId && item.approved === true && item.approvedBriefId) || null;
        if (!project) return response.status(404).json({ error: 'That project is not available for support.' });
        const result = await creditProjectDonation({ uid: claims.user_id || claims.sub, project, amount: body.amount });
        response.status(200).json({ ok: true, ...result });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'The iB Coin donation could not be completed.' });
    }
}
