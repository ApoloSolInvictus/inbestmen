import crypto from 'node:crypto';

let firebaseCertCache = { expiresAt: 0, certs: null };

const decodeBase64Url = (value) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

const decodeJwtPart = (value) => {
    try {
        return JSON.parse(decodeBase64Url(value));
    } catch (_error) {
        return null;
    }
};

const getHeader = (request, name) => {
    if (request.headers?.get) return request.headers.get(name);
    return request.headers?.[name] || request.headers?.[name.toLowerCase()] || null;
};

const getFirebaseCerts = async () => {
    if (firebaseCertCache.certs && firebaseCertCache.expiresAt > Date.now()) return firebaseCertCache.certs;
    const certResponse = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if (!certResponse.ok) throw new Error('Firebase signing certificates are unavailable.');
    const certs = await certResponse.json();
    const cacheControl = certResponse.headers.get('cache-control') || '';
    const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
    firebaseCertCache = { certs, expiresAt: Date.now() + Math.max(60, maxAge - 60) * 1000 };
    return certs;
};

const verifyFirebaseToken = async (token) => {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) throw Object.assign(new Error('FIREBASE_PROJECT_ID is not configured.'), { statusCode: 503 });

    const parts = token.split('.');
    if (parts.length !== 3) throw Object.assign(new Error('Invalid Firebase token.'), { statusCode: 401 });
    const header = decodeJwtPart(parts[0]);
    const payload = decodeJwtPart(parts[1]);
    if (!header || !payload || header.alg !== 'RS256' || !header.kid) {
        throw Object.assign(new Error('Invalid Firebase token.'), { statusCode: 401 });
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` || !payload.sub || payload.exp <= now || payload.iat > now + 60) {
        throw Object.assign(new Error('Firebase token is expired or belongs to another project.'), { statusCode: 401 });
    }

    const certs = await getFirebaseCerts();
    const certificate = certs[header.kid];
    if (!certificate) throw Object.assign(new Error('Firebase token signing key is unknown.'), { statusCode: 401 });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    if (!verifier.verify(certificate, Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64'))) {
        throw Object.assign(new Error('Firebase token signature is invalid.'), { statusCode: 401 });
    }
    return payload;
};

export const requireUser = async (request, response) => {
    const authorization = getHeader(request, 'authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) {
        response.status(401).json({ error: 'Sign in to use your inBestmen wallet.' });
        return null;
    }

    try {
        return await verifyFirebaseToken(token);
    } catch (error) {
        const statusCode = error.statusCode || 401;
        response.status(statusCode).json({ error: error.message || 'Unable to validate the Firebase session.' });
        return null;
    }
};

export const requireAdmin = async (request, response) => {
    const authorization = getHeader(request, 'authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) {
        response.status(401).json({ error: 'Sign in with an approved management account first.' });
        return null;
    }

    try {
        const claims = await verifyFirebaseToken(token);
        const email = String(claims.email || '').toLowerCase().trim();
        const approvedEmails = new Set(String(process.env.INBESTMEN_ADMIN_EMAILS || '').split(',').map((item) => item.toLowerCase().trim()).filter(Boolean));
        const hasAdminClaim = claims.admin === true || claims.manager === true;
        const hasApprovedEmail = email && claims.email_verified !== false && approvedEmails.has(email);
        if (!hasAdminClaim && !hasApprovedEmail) {
            response.status(403).json({ error: 'This account is not approved for management operations.' });
            return null;
        }
        return claims;
    } catch (error) {
        const statusCode = error.statusCode || 401;
        response.status(statusCode).json({ error: error.message || 'Unable to validate the Firebase session.' });
        return null;
    }
};

export const getRequestBodyText = async (request) => {
    if (Buffer.isBuffer(request.rawBody)) return request.rawBody.toString('utf8');
    if (typeof request.rawBody === 'string') return request.rawBody;
    if (typeof request.body === 'string') return request.body;
    if (request.body && typeof request.body === 'object') return JSON.stringify(request.body);
    if (typeof request.on === 'function') {
        const chunks = [];
        for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return Buffer.concat(chunks).toString('utf8');
    }
    return '';
};
