export default async function handler(request, response) {
    if (request.method !== 'GET') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    if (!apiKey || !agentId) {
        return response.status(503).json({ error: 'ElevenLabs is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in Vercel.' });
    }

    const query = new URLSearchParams({
        agent_id: agentId,
        environment: process.env.ELEVENLABS_ENVIRONMENT || 'production'
    });

    try {
        const elevenLabsResponse = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?${query.toString()}`, {
            headers: { 'xi-api-key': apiKey }
        });
        const data = await elevenLabsResponse.json();
        if (!elevenLabsResponse.ok) {
            return response.status(elevenLabsResponse.status).json({ error: data.detail || 'Unable to create an ElevenLabs signed URL.' });
        }
        return response.status(200).json({ signedUrl: data.signed_url });
    } catch (_error) {
        return response.status(502).json({ error: 'ElevenLabs could not be reached.' });
    }
}
