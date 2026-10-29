import { requireUser } from '../_lib/auth.js';
import { getPayPalPublicConfig } from '../_lib/paypal.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    if (!await requireUser(request, response)) return;
    try {
        response.status(200).json(getPayPalPublicConfig());
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'PayPal is not configured.' });
    }
}
