import { requireUser } from './_lib/auth.js';
import { getUserWallet } from './_lib/firestore.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
    const claims = await requireUser(request, response);
    if (!claims) return;
    try {
        const wallet = await getUserWallet(claims.user_id || claims.sub);
        response.status(200).json({ wallet });
    } catch (error) {
        response.status(error.statusCode || 503).json({ error: error.message || 'The wallet is not available.' });
    }
}
