import { requireAdmin, getRequestBodyText } from '../_lib/auth.js';
import { updateProjectPaymentAccount } from '../_lib/firestore.js';

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default async function handler(request, response) {
    if (!['PATCH', 'POST'].includes(request.method)) return response.status(405).json({ error: 'Method not allowed' });
    const claims = await requireAdmin(request, response);
    if (!claims) return;
    try {
        const bodyText = await getRequestBodyText(request);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const email = String(body.paypalRecipientEmail || '').trim().toLowerCase();
        if (!isEmail(email)) return response.status(400).json({ error: 'Enter a valid PayPal recipient email.' });
        if (body.paypalAccountConfirmed !== true) return response.status(400).json({ error: 'Confirm that the project representative provided and verified this PayPal email.' });
        const project = await updateProjectPaymentAccount({ projectId: body.projectId, paypalRecipientEmail: email, paypalAccountConfirmed: true, payoutsEnabled: body.payoutsEnabled === true, updatedBy: claims.email || claims.user_id || claims.sub });
        response.status(200).json({ ok: true, project });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'The PayPal account could not be saved.' });
    }
}
