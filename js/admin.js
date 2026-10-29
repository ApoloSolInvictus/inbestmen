import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const config = window.INBESTMEN_FIREBASE_CONFIG;
const configReady = config && config.apiKey && !config.apiKey.includes('YOUR_');
const adminEmails = new Set((window.INBESTMEN_ADMIN_EMAILS || []).map((email) => email.toLowerCase().trim()).filter(Boolean));
const gate = document.getElementById('adminGate');
const app = document.getElementById('adminApp');
const status = document.getElementById('adminAuthStatus');
const previewButton = document.getElementById('adminPreview');
const demoBanner = document.getElementById('adminDemoBanner');
let auth = null;
let currentUser = null;
let conversationCursor = null;

if (configReady) auth = getAuth(initializeApp(config));

const showStatus = (message, error = false) => {
    status.textContent = message;
    status.className = `admin-status show${error ? ' error' : ''}`;
};

const showToast = (message) => {
    const toast = document.getElementById('adminToast');
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 3600);
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const formatDate = (value) => { const date = value ? new Date(typeof value === 'number' ? value * 1000 : value) : null; return date && !Number.isNaN(date.valueOf()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; };

const setLiveMessage = (message, error = false) => {
    const element = document.getElementById('liveAgentMessage');
    element.textContent = message;
    element.style.color = error ? '#a24e46' : '';
};

const apiFetch = async (path) => {
    if (!currentUser) throw new Error('An approved Firebase management session is required.');
    const token = await currentUser.getIdToken();
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    return body;
};

const renderAgentStatus = (data) => {
    document.getElementById('liveAgentName').textContent = data.agentName || 'ElevenLabs intake agent';
    document.getElementById('liveAgentId').textContent = data.agentId || '—';
    document.getElementById('liveApiStatus').textContent = data.ok ? 'Connected' : 'Unavailable';
    document.getElementById('liveAgentChecked').textContent = formatDate(data.checkedAt);
    const pill = document.getElementById('liveAgentStatus');
    pill.className = `status-pill ${data.ok ? 'online' : 'paused'}`;
    pill.innerHTML = `<i class="bi bi-circle-fill"></i> ${data.ok ? 'Operational' : 'Unavailable'}`;
    setLiveMessage('The live agent identity and API connection are verified for this admin session.');
    document.getElementById('agentNavCount').textContent = 'LIVE';
};

const renderConversations = (data, append = false) => {
    const conversations = data.conversations || [];
    const body = document.getElementById('liveConversationBody');
    if (!append) body.innerHTML = '';
    if (!conversations.length && !append) {
        document.getElementById('liveConversationState').textContent = 'No conversations were returned for this agent yet.';
    } else {
        document.getElementById('liveConversationState').textContent = `${conversations.length}${data.has_more ? '+' : ''} recent conversation${conversations.length === 1 ? '' : 's'} loaded from ElevenLabs.`;
        body.insertAdjacentHTML('beforeend', conversations.map((conversation) => {
            const summary = conversation.transcript_summary || conversation.call_summary_title || 'Analysis is still processing.';
            const statusClass = ['done', 'completed'].includes(conversation.status) ? 'ready' : conversation.status === 'failed' ? 'paused' : 'review';
            return `<tr><td><strong>${escapeHtml(conversation.conversation_id || '—')}</strong><small>${escapeHtml(formatDate(conversation.start_time_unix_secs))}</small></td><td><span class="status-pill ${statusClass}">${escapeHtml(conversation.status || 'unknown')}</span></td><td>${escapeHtml(conversation.conversation_initiation_source || '—')}</td><td class="summary-cell" title="${escapeHtml(summary)}">${escapeHtml(summary)}</td><td><button class="table-action approve" data-live-conversation="${escapeHtml(conversation.conversation_id || '')}" type="button">Open</button></td></tr>`;
        }).join(''));
    }
    conversationCursor = data.next_cursor || null;
    document.getElementById('liveConversationCount').textContent = `${conversations.length}${data.has_more ? '+' : ''} loaded`;
    document.getElementById('loadMoreConversations').hidden = !data.has_more;
};

const renderBriefs = (data) => {
    const briefs = data.briefs || [];
    document.getElementById('liveBriefCount').textContent = `${briefs.length} saved`;
    const state = document.getElementById('liveBriefState');
    const list = document.getElementById('liveBriefList');
    if (!briefs.length) {
        state.textContent = 'No stored project briefs yet. Configure the signed post-call webhook to capture the first one.';
        list.innerHTML = '';
        return;
    }
    state.textContent = 'Structured briefs captured by the ElevenLabs webhook and stored in Firestore.';
    list.innerHTML = briefs.map((brief) => `<div class="live-brief-item"><strong>${escapeHtml(brief.project?.name || 'Unnamed project')}</strong><small>${escapeHtml(brief.founder?.name || 'Founder not captured')} · ${escapeHtml(brief.project?.location || 'Location not captured')}</small><span>${escapeHtml(brief.status || 'pending_human_review')} · ${escapeHtml(formatDate(brief.capturedAt))}</span></div>`).join('');
};

const loadConversations = async (append = false) => {
    try {
        const query = new URLSearchParams({ page_size: '10' });
        if (append && conversationCursor) query.set('cursor', conversationCursor);
        renderConversations(await apiFetch(`/api/elevenlabs/conversations?${query.toString()}`), append);
    } catch (error) {
        document.getElementById('liveConversationState').textContent = error.message;
        document.getElementById('liveConversationState').style.color = '#a24e46';
    }
};

const loadLiveOperations = async () => {
    if (!currentUser) return;
    setLiveMessage('Checking ElevenLabs, conversation history and project brief storage…');
    const [agentResult, conversationResult, briefResult] = await Promise.allSettled([
        apiFetch('/api/elevenlabs/status'),
        loadConversations(false),
        apiFetch('/api/projects/briefs?limit=10')
    ]);
    if (agentResult.status === 'fulfilled') renderAgentStatus(agentResult.value);
    else setLiveMessage(agentResult.reason.message, true);
    if (conversationResult.status === 'rejected') document.getElementById('liveConversationState').textContent = conversationResult.reason.message;
    if (briefResult.status === 'fulfilled') renderBriefs(briefResult.value);
    else {
        document.getElementById('liveBriefState').textContent = briefResult.reason.message;
        document.getElementById('liveBriefState').style.color = '#a24e46';
    }
};

const openConversation = async (conversationId) => {
    const detail = document.getElementById('conversationDetail');
    const content = document.getElementById('conversationDetailContent');
    const title = document.getElementById('conversationDetailTitle');
    title.textContent = conversationId;
    content.textContent = 'Loading conversation…';
    detail.hidden = false;
    try {
        const data = await apiFetch(`/api/elevenlabs/conversation?id=${encodeURIComponent(conversationId)}`);
        content.textContent = JSON.stringify(data.conversation || data, null, 2);
        detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { content.textContent = error.message; }
};

const setAdminIdentity = (user, preview = false) => {
    const name = user?.displayName || user?.email?.split('@')[0] || 'Management team';
    const email = user?.email || 'Preview mode';
    document.getElementById('adminUserName').textContent = name;
    document.getElementById('adminUserEmail').textContent = email;
    document.getElementById('adminAvatar').textContent = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    demoBanner.hidden = !preview;
    document.querySelector('.admin-environment').innerHTML = preview ? '<i class="bi bi-circle-fill"></i> Preview environment' : '<i class="bi bi-circle-fill"></i> Connected environment';
};

const openConsole = (user = null, preview = false) => {
    currentUser = preview ? null : user;
    setAdminIdentity(user, preview);
    gate.hidden = true;
    app.hidden = false;
    if (!preview) loadLiveOperations();
};

const isAllowedAdmin = async (user) => {
    if (!user) return false;
    const emailAllowed = user.email && adminEmails.has(user.email.toLowerCase());
    let claimsAllowed = false;
    try {
        const token = await user.getIdTokenResult();
        claimsAllowed = token.claims.admin === true || token.claims.manager === true;
    } catch (error) { console.warn('Admin claims could not be checked yet.', error); }
    return emailAllowed || claimsAllowed;
};

const authenticate = async (user) => {
    if (await isAllowedAdmin(user)) { openConsole(user); return true; }
    await signOut(auth);
    showStatus('This account is not approved for the management console. Add an admin claim or approved team email.', true);
    return false;
};

if (configReady) {
    previewButton.hidden = true;
    showStatus('Connected to Firebase. Only approved management accounts can enter this console.');
    onAuthStateChanged(auth, (user) => { if (user) authenticate(user); });
} else showStatus('Preview mode is active. Connect Firebase and configure admin claims before using real operations.');

document.getElementById('googleAdmin').addEventListener('click', async () => {
    if (!auth) return showStatus('Firebase is not connected yet. Use preview mode for the interface or add the Firebase configuration.', true);
    try { const result = await signInWithPopup(auth, new GoogleAuthProvider()); await authenticate(result.user); } catch (error) { showStatus(error.message || 'Google sign-in could not be completed.', true); }
});

document.getElementById('adminEmailSignIn').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!auth) return showStatus('Firebase is not connected yet. Add the Firebase Web App configuration first.', true);
    try { const result = await signInWithEmailAndPassword(auth, document.getElementById('adminEmail').value.trim(), document.getElementById('adminPassword').value); await authenticate(result.user); } catch (error) { showStatus(error.message || 'Team sign-in could not be completed.', true); }
});

previewButton.addEventListener('click', () => openConsole({ displayName: 'Management team', email: 'Preview mode' }, true));
document.getElementById('adminSignOut').addEventListener('click', async () => { if (auth) await signOut(auth); currentUser = null; app.hidden = true; gate.hidden = false; showStatus('You have been signed out of the management console.'); });
document.getElementById('refreshLiveData').addEventListener('click', loadLiveOperations);
document.getElementById('loadMoreConversations').addEventListener('click', () => loadConversations(true));
document.getElementById('closeConversationDetail').addEventListener('click', () => { document.getElementById('conversationDetail').hidden = true; });

const setView = (view) => {
    document.querySelectorAll('[data-admin-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.adminPanel === view));
    document.querySelectorAll('[data-admin-view]').forEach((link) => link.classList.toggle('active', link.dataset.adminView === view));
    const activeLink = document.querySelector(`[data-admin-view="${view}"] span`);
    document.getElementById('adminPageTitle').textContent = activeLink?.textContent || 'Overview';
    document.getElementById('adminSidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.querySelectorAll('[data-admin-view]').forEach((link) => link.addEventListener('click', () => setView(link.dataset.adminView)));
document.querySelectorAll('[data-admin-view-link]').forEach((link) => link.addEventListener('click', () => setView(link.dataset.adminViewLink)));
document.getElementById('adminSidebarOpen').addEventListener('click', () => document.getElementById('adminSidebar').classList.add('open'));
document.getElementById('adminSidebarClose').addEventListener('click', () => document.getElementById('adminSidebar').classList.remove('open'));

document.addEventListener('click', (event) => {
    const liveConversationButton = event.target.closest('[data-live-conversation]');
    if (liveConversationButton) openConversation(liveConversationButton.dataset.liveConversation);

    const reviewButton = event.target.closest('[data-review-action]');
    if (reviewButton) {
        const row = reviewButton.closest('[data-project-row]');
        const projectName = row.querySelector('.table-project strong').textContent;
        const action = reviewButton.dataset.reviewAction;
        row.querySelectorAll('[data-review-action]').forEach((button) => { button.disabled = true; });
        const pill = row.querySelector('.status-pill');
        pill.className = `status-pill ${action === 'approve' ? 'ready' : 'priority'}`;
        pill.textContent = action === 'approve' ? 'Approved' : 'Changes requested';
        showToast(`${projectName}: ${action === 'approve' ? 'approved for the next stage' : 'returned to the founder for changes'}.`);
        const metric = document.getElementById('pendingProjectsMetric');
        const current = Math.max(0, Number(metric.textContent) - 1);
        metric.textContent = current;
        document.getElementById('reviewNavCount').textContent = current;
    }

    const paymentButton = event.target.closest('[data-payment-action="queue"]');
    if (paymentButton) {
        const row = paymentButton.closest('[data-payment-row]');
        const projectName = row.querySelector('td strong').textContent;
        row.querySelector('.status-pill').className = 'status-pill ready';
        row.querySelector('.status-pill').textContent = 'Queued for release';
        paymentButton.disabled = true;
        paymentButton.textContent = 'Queued';
        showToast(`${projectName} payout added to the release queue.`);
    }

    const agentButton = event.target.closest('[data-agent-action]');
    if (agentButton) showToast(agentButton.dataset.agentAction === 'new' ? 'Create the agent in ElevenLabs, then refresh this workspace.' : 'Use the live conversation table below to inspect this agent.');

    const reportButton = event.target.closest('[data-project-action="report"]');
    if (reportButton) showToast('Final report preview will connect to the project evidence collection.');

    const exportButton = event.target.closest('[data-payment-action="export"]');
    if (exportButton) showToast('Ledger export will be enabled after the PayPal webhook ledger is connected.');
});
