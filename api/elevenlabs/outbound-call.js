const supportedLanguages = {
    'en-US': 'English',
    'es-ES': 'Spanish',
    'pt-BR': 'Portuguese',
    'fr-FR': 'French',
    'de-DE': 'German',
    'it-IT': 'Italian',
    'ja-JP': 'Japanese',
    'zh-CN': 'Mandarin Chinese'
};

const clean = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const normalizePhone = (value) => clean(value, 30).replace(/[\s().-]/g, '');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9]\d{7,14}$/;

const errorResponse = (response, status, error, code) => response.status(status).json({ error, code });

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return errorResponse(response, 405, 'Method not allowed.', 'METHOD_NOT_ALLOWED');
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const phoneNumberId = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
    if (!apiKey || !agentId || !phoneNumberId) {
        return errorResponse(response, 503, 'ElevenLabs outbound calling is not configured.', 'ELEVENLABS_NOT_CONFIGURED');
    }

    const input = request.body || {};
    if (clean(input.website, 80)) {
        return errorResponse(response, 400, 'Unable to process this request.', 'INVALID_REQUEST');
    }

    const projectName = clean(input.projectName, 120);
    const founderName = clean(input.founderName, 120);
    const contactEmail = clean(input.contactEmail, 180).toLowerCase();
    const phoneNumber = normalizePhone(input.phoneNumber);
    const projectLocation = clean(input.projectLocation, 160);
    const projectCategory = clean(input.projectCategory, 100);
    const projectIdea = clean(input.projectIdea, 5000);
    const preferredLanguage = clean(input.preferredLanguage, 10);
    const callConsent = input.callConsent === true || input.callConsent === 'true';

    if ([projectName, founderName, contactEmail, phoneNumber, projectLocation, projectCategory, projectIdea, preferredLanguage].some((field) => !field)) {
        return errorResponse(response, 400, 'Please complete every project and contact field.', 'MISSING_FIELDS');
    }
    if (!emailPattern.test(contactEmail)) {
        return errorResponse(response, 400, 'Please provide a valid email address.', 'INVALID_EMAIL');
    }
    if (!phonePattern.test(phoneNumber)) {
        return errorResponse(response, 400, 'Please provide a phone number with country code.', 'INVALID_PHONE');
    }
    if (!supportedLanguages[preferredLanguage]) {
        return errorResponse(response, 400, 'Please choose a supported call language.', 'INVALID_LANGUAGE');
    }
    if (!callConsent) {
        return errorResponse(response, 400, 'Call consent is required before requesting an AI intake call.', 'CONSENT_REQUIRED');
    }

    const requestBody = {
        agent_id: agentId,
        agent_phone_number_id: phoneNumberId,
        to_number: phoneNumber,
        environment: process.env.ELEVENLABS_ENVIRONMENT || 'production',
        conversation_initiation_client_data: {
            conversation_config_override: {
                agent: {
                    language: preferredLanguage.split('-')[0]
                }
            },
            dynamic_variables: {
                project_name: projectName,
                founder_name: founderName,
                contact_email: contactEmail,
                contact_phone: phoneNumber,
                project_location: projectLocation,
                project_category: projectCategory,
                project_idea: projectIdea,
                preferred_language: supportedLanguages[preferredLanguage],
                preferred_language_code: preferredLanguage
            }
        }
    };

    if (process.env.ELEVENLABS_CALL_RECORDING_ENABLED === 'true') {
        requestBody.call_recording_enabled = true;
    }

    try {
        const elevenLabsResponse = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        const data = await elevenLabsResponse.json().catch(() => ({}));
        if (!elevenLabsResponse.ok) {
            return errorResponse(response, elevenLabsResponse.status, data.detail || data.error || 'ElevenLabs could not start the outbound call.', 'ELEVENLABS_CALL_FAILED');
        }

        return response.status(200).json({
            success: true,
            message: 'Outbound intake call started.',
            conversationId: data.conversation_id || null,
            callSid: data.callSid || null,
            language: supportedLanguages[preferredLanguage]
        });
    } catch (_error) {
        return errorResponse(response, 502, 'ElevenLabs could not be reached.', 'ELEVENLABS_UNAVAILABLE');
    }
}
