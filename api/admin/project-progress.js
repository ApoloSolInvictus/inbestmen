import { requireAdmin, getRequestBodyText } from '../_lib/auth.js';
import { listProjectDocuments, updateProjectProgress } from '../_lib/firestore.js';

const clampPercent = (value) => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));

const adminProject = (project) => ({
    id: String(project.id || ''),
    name: String(project.name || 'Unnamed project'),
    category: String(project.category || 'Community project'),
    location: String(project.location || 'Location not captured'),
    status: String(project.status || 'Approved for community support'),
    ibRaised: Math.max(0, Number(project.ibRaised || 0)),
    ibGoal: Math.max(0, Number(project.ibGoal || 0)),
    projectUrl: String(project.projectUrl || ''),
    stage: String(project.stage || ''),
    progressPercent: clampPercent(project.progressPercent),
    progressUpdates: Array.isArray(project.progressUpdates) ? project.progressUpdates : [],
    approvedAt: project.approvedAt || project.updatedAt || null
});

export default async function handler(request, response) {
    if (!['GET', 'PATCH', 'POST'].includes(request.method)) return response.status(405).json({ error: 'Method not allowed' });
    const claims = await requireAdmin(request, response);
    if (!claims) return;

    try {
        if (request.method === 'GET') {
            const projects = await listProjectDocuments(100);
            const approved = projects
                .filter((project) => project.approved === true && project.approvedBriefId)
                .map(adminProject)
                .sort((first, second) => Date.parse(second.approvedAt || '') - Date.parse(first.approvedAt || ''));
            return response.status(200).json({ projects: approved });
        }

        const bodyText = await getRequestBodyText(request);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const project = await updateProjectProgress({
            projectId: body.projectId,
            projectUrl: body.projectUrl,
            stage: body.stage,
            progressPercent: body.progressPercent,
            update: body.update,
            updatedBy: claims.email || claims.user_id || claims.sub || ''
        });
        return response.status(200).json({ ok: true, project: adminProject(project) });
    } catch (error) {
        return response.status(error.statusCode || 503).json({ error: error.message || 'Project progress is unavailable.' });
    }
}
