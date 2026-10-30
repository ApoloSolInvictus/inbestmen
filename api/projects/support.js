import { requireUser } from '../_lib/auth.js';
import { getUserSupport } from '../_lib/firestore.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    const claims = await requireUser(request, response);
    if (!claims) return;
    try {
        const support = await getUserSupport(claims.user_id || claims.sub);
        response.status(200).json({ support });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'Supported projects are not available.' });
    }
}
