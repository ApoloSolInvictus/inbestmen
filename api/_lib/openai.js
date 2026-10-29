const screeningSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        nextStage: { type: 'string', enum: ['pending_human_review', 'needs_more_information'] },
        reviewSummary: { type: 'string' },
        qualityScore: { type: 'integer', minimum: 0, maximum: 100 },
        strengths: { type: 'array', items: { type: 'string' } },
        missingInformation: { type: 'array', items: { type: 'string' } },
        followUpQuestions: { type: 'array', items: { type: 'string' } },
        riskFlags: { type: 'array', items: { type: 'string' } },
        normalizedProject: {
            type: 'object',
            additionalProperties: false,
            properties: {
                projectName: { type: 'string' },
                location: { type: 'string' },
                category: { type: 'string' },
                problem: { type: 'string' },
                beneficiaries: { type: 'string' },
                proposedSolution: { type: 'string' },
                stage: { type: 'string' },
                team: { type: 'string' },
                budgetUsd: { type: 'number' },
                impact: { type: 'string' },
                timeline: { type: 'string' },
                risks: { type: 'string' }
            },
            required: ['projectName', 'location', 'category', 'problem', 'beneficiaries', 'proposedSolution', 'stage', 'team', 'budgetUsd', 'impact', 'timeline', 'risks']
        }
    },
    required: ['nextStage', 'reviewSummary', 'qualityScore', 'strengths', 'missingInformation', 'followUpQuestions', 'riskFlags', 'normalizedProject']
};

const firstValue = (source, fallback) => {
    if (typeof source === 'string' && source.trim()) return source.trim();
    if (typeof source === 'number' && Number.isFinite(source) && source > 0) return source;
    return fallback;
};

const getOutputText = (data) => data.output_text || data.output?.flatMap((item) => item.content || []).find((content) => content.type === 'output_text')?.text || '';

export const screenProjectBrief = async (brief) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw Object.assign(new Error('OpenAI is not configured. Add OPENAI_API_KEY in Vercel.'), { statusCode: 503 });

    const source = {
        founder: brief.founder,
        project: brief.project,
        existingSummary: brief.review?.summary || '',
        collected: brief.collected || {},
        sourceStatus: brief.status
    };
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: process.env.OPENAI_SCREENING_MODEL || 'gpt-5-mini',
            store: false,
            instructions: 'You are the second-stage screening assistant for inBestmen. Review the structured project intake and prepare it for human reviewers. Never approve or reject funding, never promise funding, and never invent facts. Use empty strings and budgetUsd 0 when information is missing. Set nextStage to pending_human_review only when the core project identity, location, category, problem and proposed solution are sufficiently clear; otherwise set needs_more_information. Keep personal data limited to what the founder submitted. Return concise, practical review notes.',
            input: JSON.stringify(source),
            text: { format: { type: 'json_schema', name: 'inbestmen_project_screening', strict: true, schema: screeningSchema } }
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data.error?.message || 'OpenAI screening failed.';
        throw Object.assign(new Error(message), { statusCode: response.status === 401 ? 503 : response.status >= 500 || response.status === 429 ? 503 : 502 });
    }

    const outputText = getOutputText(data);
    if (!outputText) throw Object.assign(new Error('OpenAI returned no structured screening result.'), { statusCode: 503 });
    let screening;
    try { screening = JSON.parse(outputText); } catch (_error) { throw Object.assign(new Error('OpenAI returned invalid screening JSON.'), { statusCode: 503 }); }

    const normalized = screening.normalizedProject || {};
    return {
        ...brief,
        status: screening.nextStage,
        project: {
            ...brief.project,
            name: firstValue(brief.project?.name, normalized.projectName),
            location: firstValue(brief.project?.location, normalized.location),
            category: firstValue(brief.project?.category, normalized.category),
            problem: firstValue(brief.project?.problem, normalized.problem),
            beneficiaries: firstValue(brief.project?.beneficiaries, normalized.beneficiaries),
            proposedSolution: firstValue(brief.project?.proposedSolution, normalized.proposedSolution),
            stage: firstValue(brief.project?.stage, normalized.stage),
            team: firstValue(brief.project?.team, normalized.team),
            budgetUsd: firstValue(brief.project?.budgetUsd, normalized.budgetUsd),
            impact: firstValue(brief.project?.impact, normalized.impact),
            timeline: firstValue(brief.project?.timeline, normalized.timeline),
            risks: firstValue(brief.project?.risks, normalized.risks)
        },
        aiReview: {
            summary: screening.reviewSummary,
            qualityScore: screening.qualityScore,
            strengths: screening.strengths,
            missingInformation: screening.missingInformation,
            followUpQuestions: screening.followUpQuestions,
            riskFlags: screening.riskFlags,
            model: process.env.OPENAI_SCREENING_MODEL || 'gpt-5-mini',
            requestId: data.id || null,
            screenedAt: new Date().toISOString()
        }
    };
};
