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
const userDocumentUrl = (projectId, documentId = '') => collectionUrl(projectId, 'users', documentId);
const paypalTransactionUrl = (projectId, documentId = '') => collectionUrl(projectId, 'paypalTransactions', documentId);
const projectDocumentUrl = (projectId, documentId = '') => collectionUrl(projectId, 'projects', documentId);
const supportCollectionUrl = (projectId, uid, documentId = '') => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}/support${documentId ? `/${encodeURIComponent(documentId)}` : ''}`;
const projectDonationUrl = (projectId, documentId = '') => collectionUrl(projectId, 'projectDonations', documentId);
const documentResourcePath = (projectId, collection, documentId) => `projects/${projectId}/databases/(default)/documents/${collection}/${documentId}`;
const supportResourcePath = (projectId, uid, projectKey) => `projects/${projectId}/databases/(default)/documents/users/${uid}/support/${projectKey}`;
const commitUrl = (projectId) => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`;

const readFirestoreDocument = async (url, token) => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(`Firestore could not read the document (${response.status}).`);
    return data;
};

const fieldsToObject = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));

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

export const listProjectDocuments = async (limit = 100) => {
    const { account, token } = await getAccessToken();
    const response = await fetch(`${projectDocumentUrl(account.projectId)}?${new URLSearchParams({ pageSize: String(Math.min(100, Math.max(1, limit))) })}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(`Firestore could not list projects (${response.status}).`);
    return (data.documents || []).map((document) => ({ id: document.name.split('/').pop(), ...fieldsToObject(document.fields || {}) }));
};

const makePublishedProjectId = (brief) => {
    const source = String(brief.publishedProjectId || brief.project?.name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'project';
    const suffix = String(brief.id || brief.conversationId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32);
    return `${source}-${suffix}`.slice(0, 100);
};

const makePublicBrief = (brief) => {
    const project = brief.project || {};
    const review = brief.aiReview || {};
    return {
        founderName: brief.founder?.name || '',
        summary: review.summary || brief.review?.summary || project.proposedSolution || '',
        problem: project.problem || '',
        beneficiaries: project.beneficiaries || '',
        proposedSolution: project.proposedSolution || '',
        stage: project.stage || '',
        team: project.team || '',
        budgetUsd: Number(project.budgetUsd || 0),
        impact: project.impact || '',
        timeline: project.timeline || '',
        risks: project.risks || '',
        strengths: Array.isArray(review.strengths) ? review.strengths : [],
        qualityScore: Number.isFinite(Number(review.qualityScore)) ? Number(review.qualityScore) : null,
        approvedStatus: 'approved_for_community_support'
    };
};

const projectVisuals = (category = '') => {
    const value = String(category).toLowerCase();
    if (value.includes('water') || value.includes('climate') || value.includes('energy')) return { visual: 'visual-water', icon: 'bi-droplet-half' };
    if (value.includes('food') || value.includes('regeneration')) return { visual: 'visual-food', icon: 'bi-flower1' };
    if (value.includes('health') || value.includes('wellbeing')) return { visual: 'visual-health', icon: 'bi-heart-pulse' };
    return { visual: 'visual-education', icon: 'bi-stars' };
};

export const publishProjectBrief = async ({ briefId, approvedBy = '' }) => {
    const safeBriefId = String(briefId || '').trim();
    if (!safeBriefId || safeBriefId.includes('/') || safeBriefId.length > 150) throw Object.assign(new Error('A valid project brief id is required.'), { statusCode: 400 });
    const { account, token } = await getAccessToken();
    const briefDocument = await readFirestoreDocument(documentUrl(account.projectId, safeBriefId), token);
    if (!briefDocument) throw Object.assign(new Error('That project brief could not be found.'), { statusCode: 404 });

    const storedBrief = { id: safeBriefId, ...fieldsToObject(briefDocument.fields || {}) };
    if (!['pending_human_review', 'approved'].includes(String(storedBrief.status || ''))) throw Object.assign(new Error('This project needs more information before it can be published.'), { statusCode: 409 });
    const project = storedBrief.project || {};
    const publicBrief = makePublicBrief(storedBrief);
    const projectId = storedBrief.publishedProjectId || makePublishedProjectId(storedBrief);
    const existingProjectDocument = await readFirestoreDocument(projectDocumentUrl(account.projectId, projectId), token);
    const existingProject = fieldsToObject(existingProjectDocument?.fields || {});
    const visuals = projectVisuals(project.category);
    const now = new Date().toISOString();
    const ibGoal = Math.max(0, Math.round(Number(existingProject.ibGoal || project.budgetUsd || 0)));
    const nextProject = {
        ...existingProject,
        id: projectId,
        name: project.name || 'Unnamed project',
        category: project.category || 'Community project',
        location: project.location || 'Location not captured',
        summary: publicBrief.summary || project.proposedSolution || 'Approved project proposal.',
        ibRaised: Math.max(0, Number(existingProject.ibRaised || 0)),
        ibGoal,
        status: 'Approved for community support',
        approved: true,
        approvedBriefId: safeBriefId,
        approvedAt: existingProject.approvedAt || now,
        proposalUrl: existingProject.proposalUrl || '',
        publicBrief,
        ...visuals,
        updatedAt: now
    };
    const nextBrief = {
        ...storedBrief,
        status: 'approved',
        publishedProjectId: projectId,
        approvedAt: existingProject.approvedAt || now,
        approvedBy: approvedBy || storedBrief.approvedBy || ''
    };
    const writes = [
        {
            update: { name: documentResourcePath(account.projectId, 'elevenlabsProjectBriefs', safeBriefId), fields: Object.fromEntries(Object.entries(nextBrief).map(([key, value]) => [key, toFirestoreValue(value)])) },
            currentDocument: briefDocument.updateTime ? { updateTime: briefDocument.updateTime } : { exists: false }
        },
        {
            update: { name: documentResourcePath(account.projectId, 'projects', projectId), fields: Object.fromEntries(Object.entries(nextProject).map(([key, value]) => [key, toFirestoreValue(value)])) },
            currentDocument: existingProjectDocument?.updateTime ? { updateTime: existingProjectDocument.updateTime } : { exists: false }
        }
    ];
    const commitResponse = await fetch(commitUrl(account.projectId), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
    if (!commitResponse.ok) throw Object.assign(new Error('The project could not be published safely. Please refresh and try again.'), { statusCode: 409 });
    return { brief: nextBrief, project: nextProject };
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

export const getUserWallet = async (uid) => {
    const safeUid = String(uid || '').trim();
    if (!safeUid || safeUid.includes('/') || safeUid.length > 128) throw Object.assign(new Error('A valid Firebase user is required.'), { statusCode: 400 });
    const { account, token } = await getAccessToken();
    const document = await readFirestoreDocument(userDocumentUrl(account.projectId, safeUid), token);
    const fields = fieldsToObject(document?.fields || {});
    return { uid: safeUid, ibBalance: Number(fields.ibBalance || 0), totalPurchasedUsd: Number(fields.totalPurchasedUsd || 0), updatedAt: fields.updatedAt || null };
};

export const getUserSupport = async (uid) => {
    const safeUid = String(uid || '').trim();
    if (!safeUid || safeUid.includes('/') || safeUid.length > 128) throw Object.assign(new Error('A valid Firebase user is required.'), { statusCode: 400 });
    const { account, token } = await getAccessToken();
    const response = await fetch(`${supportCollectionUrl(account.projectId, safeUid)}?pageSize=100`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return [];
    const data = await response.json();
    if (!response.ok) throw new Error(`Firestore could not list project support (${response.status}).`);
    return (data.documents || []).map((document) => ({ id: document.name.split('/').pop(), ...fieldsToObject(document.fields || {}) }));
};

export const creditProjectDonation = async ({ uid, project, amount }) => {
    const safeUid = String(uid || '').trim();
    const projectKey = String(project?.id || '').trim();
    if (!safeUid || safeUid.includes('/') || safeUid.length > 128 || !projectKey || projectKey.includes('/') || projectKey.length > 100) throw Object.assign(new Error('A valid user and project are required.'), { statusCode: 400 });
    const donationAmount = Number(amount);
    if (!Number.isInteger(donationAmount) || donationAmount < 1 || donationAmount > 1000000) throw Object.assign(new Error('The iB Coin amount is invalid.'), { statusCode: 400 });
    const { account, token } = await getAccessToken();
    const [walletDocument, projectDocument, supportDocument] = await Promise.all([
        readFirestoreDocument(userDocumentUrl(account.projectId, safeUid), token),
        readFirestoreDocument(projectDocumentUrl(account.projectId, projectKey), token),
        readFirestoreDocument(supportCollectionUrl(account.projectId, safeUid, projectKey), token)
    ]);
    const walletFields = fieldsToObject(walletDocument?.fields || {});
    const storedProjectFields = fieldsToObject(projectDocument?.fields || {});
    const projectFields = { ...project, ...storedProjectFields };
    const currentBalance = Number(walletFields.ibBalance || 0);
    const currentRaised = Number(projectFields.ibRaised || 0);
    const goal = Number(projectFields.ibGoal || 0);
    if (currentBalance < donationAmount) throw Object.assign(new Error(`Your wallet has ${currentBalance} iB Coins available. Buy more Coins before donating.`), { statusCode: 409 });
    if (goal > 0 && currentRaised >= goal) throw Object.assign(new Error('This project has already reached its donation goal.'), { statusCode: 409 });
    if (goal > 0 && currentRaised + donationAmount > goal) throw Object.assign(new Error(`Only ${goal - currentRaised} iB Coins remain before this project reaches its goal.`), { statusCode: 409 });

    const supportFields = fieldsToObject(supportDocument?.fields || {});
    const now = new Date().toISOString();
    const nextBalance = currentBalance - donationAmount;
    const nextRaised = currentRaised + donationAmount;
    const nextSupport = Number(supportFields.ibDonated || 0) + donationAmount;
    const nextWalletFields = { ...walletFields, uid: safeUid, ibBalance: nextBalance, totalDonatedIb: Number(walletFields.totalDonatedIb || 0) + donationAmount, updatedAt: now };
    const nextProjectFields = { ...projectFields, id: projectKey, ibRaised: nextRaised, updatedAt: now };
    const donationId = crypto.randomUUID();
    const writes = [
        {
            update: { name: documentResourcePath(account.projectId, 'users', safeUid), fields: Object.fromEntries(Object.entries(nextWalletFields).map(([key, value]) => [key, toFirestoreValue(value)])) },
            currentDocument: walletDocument?.updateTime ? { updateTime: walletDocument.updateTime } : { exists: false }
        },
        {
            update: { name: documentResourcePath(account.projectId, 'projects', projectKey), fields: Object.fromEntries(Object.entries(nextProjectFields).map(([key, value]) => [key, toFirestoreValue(value)])) },
            currentDocument: projectDocument?.updateTime ? { updateTime: projectDocument.updateTime } : { exists: false }
        },
        {
            update: { name: supportResourcePath(account.projectId, safeUid, projectKey), fields: { projectId: toFirestoreValue(projectKey), ibDonated: toFirestoreValue(nextSupport), updatedAt: toFirestoreValue(now) } },
            currentDocument: supportDocument?.updateTime ? { updateTime: supportDocument.updateTime } : { exists: false }
        },
        {
            update: { name: documentResourcePath(account.projectId, 'projectDonations', donationId), fields: { id: toFirestoreValue(donationId), uid: toFirestoreValue(safeUid), projectId: toFirestoreValue(projectKey), amountIb: toFirestoreValue(donationAmount), createdAt: toFirestoreValue(now), status: toFirestoreValue('COMPLETED') } },
            currentDocument: { exists: false }
        }
    ];
    const commitResponse = await fetch(commitUrl(account.projectId), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
    if (!commitResponse.ok) throw Object.assign(new Error('The donation could not be recorded safely. Please refresh and try again.'), { statusCode: 409 });
    return { donationId, wallet: { uid: safeUid, ibBalance: nextBalance, totalPurchasedUsd: Number(walletFields.totalPurchasedUsd || 0), updatedAt: now }, project: { ...nextProjectFields, progress: goal > 0 ? Math.min(100, Math.round((nextRaised / goal) * 100)) : 0 }, amount: donationAmount };
};

export const creditUserWallet = async ({ uid, orderId, captureId, amountUsd, currency, paypalStatus }) => {
    const safeUid = String(uid || '').trim();
    const safeOrderId = String(orderId || '').trim();
    if (!safeUid || safeUid.includes('/') || safeUid.length > 128 || !safeOrderId || safeOrderId.includes('/') || safeOrderId.length > 150) throw Object.assign(new Error('A valid wallet and PayPal order are required.'), { statusCode: 400 });
    const amount = Number(amountUsd);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) throw Object.assign(new Error('The PayPal amount is invalid.'), { statusCode: 400 });
    const { account, token } = await getAccessToken();
    const [walletDocument, existingTransaction] = await Promise.all([
        readFirestoreDocument(userDocumentUrl(account.projectId, safeUid), token),
        readFirestoreDocument(paypalTransactionUrl(account.projectId, safeOrderId), token)
    ]);
    const existingFields = fieldsToObject(existingTransaction?.fields || {});
    const walletFields = fieldsToObject(walletDocument?.fields || {});
    if (existingFields.status === 'COMPLETED') return { credited: false, duplicate: true, wallet: { uid: safeUid, ibBalance: Number(walletFields.ibBalance || 0), totalPurchasedUsd: Number(walletFields.totalPurchasedUsd || 0), updatedAt: walletFields.updatedAt || null } };

    const now = new Date().toISOString();
    const nextBalance = Number(walletFields.ibBalance || 0) + amount;
    const nextPurchased = Number(walletFields.totalPurchasedUsd || 0) + amount;
    const nextWalletFields = { ...walletFields, uid: safeUid, ibBalance: nextBalance, totalPurchasedUsd: nextPurchased, updatedAt: now };
    const writes = [
        {
            update: { name: documentResourcePath(account.projectId, 'users', safeUid), fields: Object.fromEntries(Object.entries(nextWalletFields).map(([key, value]) => [key, toFirestoreValue(value)])) },
            currentDocument: walletDocument?.updateTime ? { updateTime: walletDocument.updateTime } : { exists: false }
        },
        {
            update: { name: documentResourcePath(account.projectId, 'paypalTransactions', safeOrderId), fields: { provider: toFirestoreValue('paypal'), orderId: toFirestoreValue(safeOrderId), captureId: toFirestoreValue(captureId || ''), uid: toFirestoreValue(safeUid), amountUsd: toFirestoreValue(amount), coins: toFirestoreValue(amount), currency: toFirestoreValue(currency || 'USD'), status: toFirestoreValue(paypalStatus || 'COMPLETED'), capturedAt: toFirestoreValue(now) } },
            currentDocument: { exists: false }
        }
    ];
    const commitResponse = await fetch(commitUrl(account.projectId), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
    if (!commitResponse.ok) {
        const transactionAfterConflict = await readFirestoreDocument(paypalTransactionUrl(account.projectId, safeOrderId), token);
        const transactionFields = fieldsToObject(transactionAfterConflict?.fields || {});
        if (transactionFields.status === 'COMPLETED') {
            const walletAfterConflict = await getUserWallet(safeUid);
            return { credited: false, duplicate: true, wallet: walletAfterConflict };
        }
        throw new Error(`Firestore could not record the PayPal purchase (${commitResponse.status}).`);
    }
    return { credited: true, duplicate: false, wallet: { uid: safeUid, ibBalance: nextBalance, totalPurchasedUsd: nextPurchased, updatedAt: now } };
};
