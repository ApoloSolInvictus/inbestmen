import { requireUser } from '../_lib/auth.js';
import { listProjectDocuments } from '../_lib/firestore.js';
import { PROJECT_CATALOG } from '../_lib/project-catalog.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireUser(request, response)) return;
    try {
        const stored = await listProjectDocuments(100);
        const storedById = new Map(stored.map((project) => [String(project.id), project]));
        const projects = PROJECT_CATALOG.map((project) => ({ ...project, ...(storedById.get(project.id) || {}) }));
        stored.forEach((project) => {
            if (!projects.some((catalogProject) => catalogProject.id === String(project.id))) projects.push(project);
        });
        response.status(200).json({ projects });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'Projects are not available.' });
    }
}
