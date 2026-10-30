export default function handler(_request, response) {
    response.status(200).json({
        ok: true,
        service: 'inBestmen platform',
        environment: process.env.VERCEL_ENV || 'local',
        integrations: {
            openai: Boolean(process.env.OPENAI_API_KEY),
            paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
            paypalEnvironment: String(process.env.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox',
            paypalWebhook: Boolean(process.env.PAYPAL_WEBHOOK_ID),
            weeklyPayoutScheduler: Boolean(process.env.CRON_SECRET),
            elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY && (process.env.ELEVENLABS_AGENT_ID || 'agent_1801m62c1ranf3y9g9p4v2hd7g1v')),
            elevenlabsWebhook: Boolean(process.env.ELEVENLABS_WEBHOOK_SECRET || process.env.ELEVENLABS_POST_CALL_WEBHOOK_SECRET),
            firestore: Boolean(process.env.FIREBASE_PROJECT_ID && (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)))
        }
    });
}
