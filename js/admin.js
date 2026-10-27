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
    setAdminIdentity(user, preview);
    gate.hidden = true;
    app.hidden = false;
};

const isAllowedAdmin = async (user) => {
    if (!user) return false;
    const emailAllowed = user.email && adminEmails.has(user.email.toLowerCase());
    let claimsAllowed = false;
    try {
        const token = await user.getIdTokenResult();
        claimsAllowed = token.claims.admin === true || token.claims.manager === true;
    } catch (error) {
        console.warn('Admin claims could not be checked yet.', error);
    }
    return emailAllowed || claimsAllowed;
};

const authenticate = async (user) => {
    if (await isAllowedAdmin(user)) {
        openConsole(user);
        return true;
    }
    await signOut(auth);
    showStatus('This account is not approved for the management console. Add an admin claim or approved team email.', true);
    return false;
};

if (configReady) {
    previewButton.hidden = true;
    showStatus('Connected to Firebase. Only approved management accounts can enter this console.');
    onAuthStateChanged(auth, (user) => { if (user) authenticate(user); });
} else {
    showStatus('Preview mode is active. Connect Firebase and configure admin claims before using real operations.');
}

document.getElementById('googleAdmin').addEventListener('click', async () => {
    if (!auth) return showStatus('Firebase is not connected yet. Use preview mode for the interface or add the Firebase configuration.', true);
    try {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        await authenticate(result.user);
    } catch (error) {
        showStatus(error.message || 'Google sign-in could not be completed.', true);
    }
});

document.getElementById('adminEmailSignIn').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!auth) return showStatus('Firebase is not connected yet. Add the Web App configuration first.', true);
    try {
        const result = await signInWithEmailAndPassword(auth, document.getElementById('adminEmail').value.trim(), document.getElementById('adminPassword').value);
        await authenticate(result.user);
    } catch (error) {
        showStatus(error.message || 'Team sign-in could not be completed.', true);
    }
});

previewButton.addEventListener('click', () => openConsole({ displayName: 'Management team', email: 'Preview mode' }, true));
document.getElementById('adminSignOut').addEventListener('click', async () => { if (auth) await signOut(auth); app.hidden = true; gate.hidden = false; showStatus('You have been signed out of the management console.'); });

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
    if (agentButton) showToast(agentButton.dataset.agentAction === 'new' ? 'Agent creation will connect to the ElevenLabs workspace in the next backend pass.' : 'ElevenLabs agent workspace will open once the signed URL API is connected.');

    const reportButton = event.target.closest('[data-project-action="report"]');
    if (reportButton) showToast('Final report preview will connect to the project evidence collection.');

    const exportButton = event.target.closest('[data-payment-action="export"]');
    if (exportButton) showToast('Ledger export will be enabled after the PayPal webhook ledger is connected.');
});
