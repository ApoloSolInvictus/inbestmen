const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

export const getElevenLabsAgentId = () => process.env.ELEVENLABS_AGENT_ID || 'agent_1801m62c1ranf3y9g9p4v2hd7g1v';

export const getElevenLabsConfig = () => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = getElevenLabsAgentId();
    if (!apiKey || !agentId) {
        throw Object.assign(new Error('ElevenLabs is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in Vercel.'), { statusCode: 503 });
    }
    return { apiKey, agentId };
};

export const fetchElevenLabs = async (path, options = {}) => {
    const { apiKey } = getElevenLabsConfig();
    const response = await fetch(`${ELEVENLABS_API_BASE}${path}`, {
        ...options,
        headers: {
            Accept: 'application/json',
            'xi-api-key': apiKey,
            ...(options.headers || {})
        }
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_error) { data = { raw: text }; }
    if (!response.ok) {
        const detail = data.detail?.message || data.detail || data.message || 'ElevenLabs API request failed.';
        throw Object.assign(new Error(String(detail)), { statusCode: response.status });
    }
    return data;
};

export const sendError = (response, error) => response.status(error.statusCode || 502).json({ error: error.message || 'ElevenLabs request failed.' });
