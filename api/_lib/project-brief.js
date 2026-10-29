const unwrap = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'object') return value;
    if ('value' in value) return unwrap(value.value);
    for (const key of ['string_value', 'integer_value', 'double_value', 'boolean_value']) {
        if (key in value) return value[key];
    }
    return value;
};

const normalizeKey = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');

const getCollectedValue = (results, aliases) => {
    const wanted = aliases.map(normalizeKey);
    for (const [key, value] of Object.entries(results || {})) {
        if (wanted.includes(normalizeKey(key))) return unwrap(value);
    }
    return null;
};

const dynamicValue = (variables, aliases) => {
    const wanted = aliases.map(normalizeKey);
    for (const [key, value] of Object.entries(variables || {})) {
        if (wanted.includes(normalizeKey(key))) return unwrap(value);
    }
    return null;
};

const numberValue = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;
    const number = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? number : null;
};

const stripAudio = (value) => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(stripAudio);
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['full_audio', 'audio_base64'].includes(key)).map(([key, item]) => [key, stripAudio(item)]));
};

export const buildProjectBrief = (event) => {
    const data = event.data || event;
    const analysis = data.analysis || {};
    const collected = analysis.data_collection_results || data.data_collection_results || {};
    const dynamicVariables = data.conversation_initiation_client_data?.dynamic_variables || {};
    const projectName = getCollectedValue(collected, ['project_name', 'projectName', 'project']) || '';
    const founderName = getCollectedValue(collected, ['founder_name', 'founderName', 'name']) || '';
    const location = getCollectedValue(collected, ['location', 'project_location', 'projectLocation', 'country']) || '';
    const category = getCollectedValue(collected, ['category', 'project_category', 'projectCategory']) || '';
    const problem = getCollectedValue(collected, ['problem', 'challenge']) || '';
    const beneficiaries = getCollectedValue(collected, ['beneficiaries', 'people_helped', 'target_beneficiaries']) || '';
    const solution = getCollectedValue(collected, ['proposed_solution', 'proposedSolution', 'solution', 'idea']) || '';
    const nextStage = getCollectedValue(collected, ['next_stage', 'nextStage', 'review_status']) || '';
    const coreFieldsReady = Boolean(projectName && founderName && location && category && solution);
    const normalizedStage = String(nextStage).toLowerCase().includes('more') ? 'needs_more_information' : coreFieldsReady ? 'pending_human_review' : 'needs_more_information';
    const safeData = stripAudio(data);

    return {
        schemaVersion: 'inbestmen.project-brief.v1',
        source: 'elevenlabs_post_call_transcription',
        capturedAt: new Date((event.event_timestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        conversationId: data.conversation_id || dynamicValue(dynamicVariables, ['system__conversation_id', 'conversation_id']) || null,
        agentId: data.agent_id || null,
        agentName: data.agent_name || null,
        channel: data.conversation_initiation_source || (dynamicValue(dynamicVariables, ['integration__telegram_chat_id', 'telegram_chat_id']) ? 'telegram' : 'unknown'),
        status: normalizedStage,
        founder: {
            name: founderName,
            email: getCollectedValue(collected, ['email', 'founder_email', 'founderEmail']) || '',
            telegramUsername: getCollectedValue(collected, ['telegram_username', 'telegramUsername', 'username']) || '',
            telegramChatId: dynamicValue(dynamicVariables, ['integration__telegram_chat_id', 'telegram_chat_id']) || getCollectedValue(collected, ['telegram_chat_id', 'telegramChatId']) || ''
        },
        project: {
            name: projectName,
            location,
            category,
            problem,
            beneficiaries,
            proposedSolution: solution,
            stage: getCollectedValue(collected, ['stage', 'project_stage']) || '',
            team: getCollectedValue(collected, ['team', 'founding_team']) || '',
            budgetUsd: numberValue(getCollectedValue(collected, ['budget', 'budget_usd', 'budgetUsd', 'goal'])),
            impact: getCollectedValue(collected, ['impact', 'expected_impact']) || '',
            timeline: getCollectedValue(collected, ['timeline', 'timeframe']) || '',
            risks: getCollectedValue(collected, ['risks', 'risk']) || ''
        },
        review: {
            summary: analysis.transcript_summary || data.transcript_summary || '',
            callSuccessful: analysis.call_successful ?? data.call_successful ?? null,
            evaluationResults: analysis.evaluation_results || data.evaluation_results || {}
        },
        collected,
        transcript: Array.isArray(data.transcript) ? data.transcript : [],
        rawData: safeData
    };
};
