import { requireAdmin } from '../_lib/auth.js';
import { listProjectBriefs } from '../_lib/firestore.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireAdmin(request, response)) return;
    try {
        const briefs = await listProjectBriefs(Number(request.query?.limit || 30));
        response.status(200).json({ briefs });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'Project briefs are not available.' });
    }
}
