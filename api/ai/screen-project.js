import { requireAdmin } from '../_lib/auth.js';

const projectSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        projectName: { type: 'string' },
        founderName: { type: 'string' },
        location: { type: 'string' },
        category: { type: 'string' },
        problem: { type: 'string' },
        beneficiaries: { type: 'string' },
        proposedSolution: { type: 'string' },
        firstQuestions: { type: 'array', items: { type: 'string' } },
        nextStage: { type: 'string', enum: ['human_review', 'needs_more_information'] }
    },
    required: ['projectName', 'founderName', 'location', 'category', 'problem', 'beneficiaries', 'proposedSolution', 'firstQuestions', 'nextStage']
};

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    if (!await requireAdmin(request, response)) return;

    if (!process.env.OPENAI_API_KEY) {
        return response.status(503).json({ error: 'OpenAI is not configured. Add OPENAI_API_KEY in Vercel.' });
    }

    const input = request.body || {};
    const requiredFields = ['projectName', 'founderName', 'projectLocation', 'projectCategory', 'projectIdea'];
    if (requiredFields.some((field) => typeof input[field] !== 'string' || !input[field].trim())) {
        return response.status(400).json({ error: 'Please complete every project field.' });
    }

    const prompt = `You are the first-stage project intake agent for inBestmen, a global social investment platform. Transform the founder's answers into a concise project brief for human reviewers. Do not promise funding, make a final investment decision, or infer sensitive personal data. Ask three practical follow-up questions that the Telegram intake agent should ask next.\n\nFounder answers:\nProject: ${input.projectName}\nFounder: ${input.founderName}\nLocation: ${input.projectLocation}\nCategory: ${input.projectCategory}\nIdea: ${input.projectIdea}`;

    try {
        const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: process.env.OPENAI_SCREENING_MODEL || 'gpt-5-mini',
                store: false,
                input: prompt,
                text: {
                    format: {
                        type: 'json_schema',
                        name: 'inbestmen_project_brief',
                        strict: true,
                        schema: projectSchema
                    }
                }
            })
        });
        const data = await openAiResponse.json();
        if (!openAiResponse.ok) {
            return response.status(openAiResponse.status).json({ error: data.error?.message || 'OpenAI screening failed.' });
        }

        const outputText = data.output_text || data.output?.flatMap((item) => item.content || []).find((content) => content.type === 'output_text')?.text;
        if (!outputText) return response.status(502).json({ error: 'OpenAI returned no structured project brief.' });
        return response.status(200).json({ brief: JSON.parse(outputText), requestId: data.id });
    } catch (_error) {
        return response.status(502).json({ error: 'The AI screening service could not be reached.' });
    }
}
