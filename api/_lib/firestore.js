import crypto from 'node:crypto';

let accessTokenCache = { token: null, expiresAt: 0 };

const encodeBase64Url = (value) => Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const getServiceAccount = () => {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    let account = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try { account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON); } catch (_error) { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'); }
    }
    const clientEmail = account?.client_email || process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = (account?.private_key || process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) return null;
    return { projectId, clientEmail, privateKey };
};

export const isFirestoreConfigured = () => Boolean(getServiceAccount());

const getAccessToken = async () => {
    const account = getServiceAccount();
    if (!account) throw Object.assign(new Error('Firestore is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_PROJECT_ID in Vercel.'), { statusCode: 503 });
    if (accessTokenCache.token && accessTokenCache.expiresAt > Date.now() + 60000) return { account, token: accessTokenCache.token };

    const issuedAt = Math.floor(Date.now() / 1000);
    const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = encodeBase64Url(JSON.stringify({ iss: account.clientEmail, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: issuedAt, exp: issuedAt + 3600 }));
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    signer.end();
    const assertion = `${header}.${claim}.${encodeBase64Url(signer.sign(account.privateKey))}`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error('Google could not issue a Firestore access token.');
    accessTokenCache = { token: tokenData.access_token, expiresAt: Date.now() + Number(tokenData.expires_in || 3600) * 1000 };
    return { account, token: accessTokenCache.token };
};

const toFirestoreValue = (value) => {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
    if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, toFirestoreValue(item)])) } };
    return { stringValue: String(value) };
};

const fromFirestoreValue = (value) => {
    if (!value) return null;
    if ('nullValue' in value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
    if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, fromFirestoreValue(item)]));
    return value;
};

const collectionUrl = (projectId, collection, documentId = '') => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${collection}${documentId ? `/${encodeURIComponent(documentId)}` : ''}`;
const documentUrl = (projectId, documentId = '') => collectionUrl(projectId, 'elevenlabsProjectBriefs', documentId);
const stateDocumentUrl = (projectId, documentId = '') => collectionUrl(projectId, 'inbestmenAdminState', documentId);

export const storeProjectBrief = async (brief) => {
    const { account, token } = await getAccessToken();
    const conversationId = String(brief.conversationId || `event-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
    const response = await fetch(documentUrl(account.projectId, conversationId), { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries({ ...brief, updatedAt: new Date().toISOString() }).map(([key, value]) => [key, toFirestoreValue(value)])) }) });
    if (!response.ok) throw new Error(`Firestore could not save the project brief (${response.status}).`);
    return { documentId: conversationId };
};

export const listProjectBriefs = async (limit = 50) => {
    const { account, token } = await getAccessToken();
    const query = new URLSearchParams({ pageSize: String(Math.min(100, Math.max(1, limit))), orderBy: 'capturedAt desc' });
    const response = await fetch(`${documentUrl(account.projectId)}?${query.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(`Firestore could not list project briefs (${response.status}).`);
    return (data.documents || []).map((document) => ({ id: document.name.split('/').pop(), ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, fromFirestoreValue(value)])) }));
};

export const deleteProjectBrief = async (documentId) => {
    const safeId = String(documentId || '').trim();
    if (!safeId || safeId.includes('/') || safeId.length > 150) throw Object.assign(new Error('A valid project brief id is required.'), { statusCode: 400 });
    const { account, token } = await getAccessToken();
    const response = await fetch(documentUrl(account.projectId, safeId), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return { deleted: false };
    if (!response.ok) throw new Error(`Firestore could not delete the project brief (${response.status}).`);
    return { deleted: true };
};

export const deleteAllProjectBriefs = async () => {
    const { account, token } = await getAccessToken();
    let deleted = 0;
    while (true) {
        const response = await fetch(`${documentUrl(account.projectId)}?pageSize=100`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(`Firestore could not list project briefs for deletion (${response.status}).`);
        const documents = data.documents || [];
        if (!documents.length) break;
        for (const document of documents) {
            const documentId = document.name.split('/').pop();
            const deleteResponse = await fetch(documentUrl(account.projectId, documentId), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!deleteResponse.ok && deleteResponse.status !== 404) throw new Error(`Firestore could not delete project brief (${deleteResponse.status}).`);
            if (deleteResponse.ok || deleteResponse.status === 404) deleted += 1;
        }
    }
    return { deleted };
};

export const getProjectSyncBaseline = async () => {
    const { account, token } = await getAccessToken();
    const response = await fetch(stateDocumentUrl(account.projectId, 'intake'), { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(`Firestore could not read the intake baseline (${response.status}).`);
    return fromFirestoreValue(data.fields?.resetAt) || null;
};

export const getIgnoredProjectBriefIds = async () => {
    const { account, token } = await getAccessToken();
    const response = await fetch(stateDocumentUrl(account.projectId, 'ignoredCalls'), { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return [];
    const data = await response.json();
    if (!response.ok) throw new Error(`Firestore could not read ignored project briefs (${response.status}).`);
    const ids = fromFirestoreValue(data.fields?.conversationIds);
    return Array.isArray(ids) ? ids.map((id) => String(id)) : [];
};

export const addIgnoredProjectBriefId = async (conversationId) => {
    const safeId = String(conversationId || '').trim();
    if (!safeId || safeId.includes('/') || safeId.length > 150) throw Object.assign(new Error('A valid project brief id is required.'), { statusCode: 400 });
    const { account, token } = await getAccessToken();
    const response = await fetch(stateDocumentUrl(account.projectId, 'ignoredCalls'), { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok && response.status !== 404) throw new Error(`Firestore could not read ignored project briefs (${response.status}).`);
    const data = response.status === 404 ? {} : await response.json();
    const current = fromFirestoreValue(data.fields?.conversationIds);
    const conversationIds = Array.from(new Set([...(Array.isArray(current) ? current.map((id) => String(id)) : []), safeId]));
    const saveResponse = await fetch(stateDocumentUrl(account.projectId, 'ignoredCalls'), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { conversationIds: toFirestoreValue(conversationIds), updatedAt: toFirestoreValue(new Date().toISOString()) } })
    });
    if (!saveResponse.ok) throw new Error(`Firestore could not save ignored project briefs (${saveResponse.status}).`);
    return conversationIds;
};

export const setProjectSyncBaseline = async (resetAt = new Date().toISOString()) => {
    const { account, token } = await getAccessToken();
    const response = await fetch(stateDocumentUrl(account.projectId, 'intake'), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { resetAt: toFirestoreValue(resetAt), updatedAt: toFirestoreValue(new Date().toISOString()) } })
    });
    if (!response.ok) throw new Error(`Firestore could not save the intake baseline (${response.status}).`);
    return resetAt;
};
