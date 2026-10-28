export default function handler(_request, response) {
    response.status(200).json({
        ok: true,
        service: 'inBestmen platform',
        environment: process.env.VERCEL_ENV || 'local',
        integrations: {
            openai: Boolean(process.env.OPENAI_API_KEY),
            elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID && process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID)
        }
    });
}
