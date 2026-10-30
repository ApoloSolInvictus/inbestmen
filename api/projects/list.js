import { requireUser } from '../_lib/auth.js';
import { listProjectDocuments } from '../_lib/firestore.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireUser(request, response)) return;
    try {
        const projects = await listProjectDocuments(100);
        response.status(200).json({ projects: projects.filter((project) => project.approved === true && project.approvedBriefId) });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'Projects are not available.' });
    }
}
