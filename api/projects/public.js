import { listProjectDocuments } from '../_lib/firestore.js';

const PUBLIC_VISUALS = new Set(['visual-water', 'visual-food', 'visual-health', 'visual-education']);
const PUBLIC_ICONS = new Set(['bi-droplet-half', 'bi-flower1', 'bi-heart-pulse', 'bi-stars']);

const number = (value) => Math.max(0, Number(value || 0));

const publicBrief = (project) => {
    const brief = project.publicBrief || {};
    return {
        founderName: String(brief.founderName || ''),
        summary: String(brief.summary || project.summary || ''),
        problem: String(brief.problem || ''),
        beneficiaries: String(brief.beneficiaries || ''),
        proposedSolution: String(brief.proposedSolution || ''),
        stage: String(brief.stage || ''),
        team: String(brief.team || ''),
        budgetUsd: number(brief.budgetUsd),
        impact: String(brief.impact || ''),
        timeline: String(brief.timeline || ''),
        risks: String(brief.risks || ''),
        strengths: Array.isArray(brief.strengths) ? brief.strengths.map((item) => String(item)).slice(0, 8) : [],
        qualityScore: Number.isFinite(Number(brief.qualityScore)) ? Number(brief.qualityScore) : null,
        approvedStatus: 'approved_for_community_support'
    };
};

const safeProposalUrl = (value) => {
    const url = String(value || '').trim();
    return /^https:\/\//i.test(url) || /^project-proposal\.html(?:\?|#|$)/i.test(url) ? url : '';
};

const toPublicProject = (project) => ({
    id: String(project.id || ''),
    name: String(project.name || 'Unnamed project'),
    category: String(project.category || 'Community project'),
    location: String(project.location || 'Location not captured'),
    summary: String(project.summary || ''),
    status: String(project.status || 'Approved for community support'),
    ibRaised: number(project.ibRaised),
    ibGoal: number(project.ibGoal),
    approvedAt: project.approvedAt || project.updatedAt || null,
    proposalUrl: safeProposalUrl(project.proposalUrl),
    visual: PUBLIC_VISUALS.has(project.visual) ? project.visual : 'visual-education',
    icon: PUBLIC_ICONS.has(project.icon) ? project.icon : 'bi-stars',
    publicBrief: publicBrief(project)
});

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    try {
        const limit = Math.min(100, Math.max(1, Number(request.query?.limit || 100)));
        const projects = (await listProjectDocuments(limit))
            .filter((project) => project.approved === true && project.approvedBriefId)
            .map(toPublicProject)
            .sort((first, second) => Date.parse(second.approvedAt || '') - Date.parse(first.approvedAt || ''));
        response.status(200).json({ projects });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'Approved projects are not available.' });
    }
}
