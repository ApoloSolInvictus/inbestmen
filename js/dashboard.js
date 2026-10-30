import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const config = window.INBESTMEN_FIREBASE_CONFIG;
const configReady = config && config.apiKey && !config.apiKey.includes('YOUR_');
let auth = null;
if (configReady) auth = getAuth(initializeApp(config));

let currentUser = null;
let selectedAmount = 1;
let paypalRendered = false;
let paypalSdkPromise = null;
let walletBalance = 0;
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const welcomeName = document.getElementById('welcomeName');
const userAvatar = document.getElementById('userAvatar');
const projectGrid = document.getElementById('projectGrid');
const myProjectGrid = document.getElementById('myProjectGrid');
const futureGrid = document.getElementById('futureGrid');
const projectEmptyState = document.getElementById('projectEmptyState');
const futureEmptyState = document.getElementById('futureEmptyState');

let projects = [];
let supported = [];
let modalProjectId = '';
let lastFocusedElement = null;

const defaultPublicBrief = (project) => ({
    founderName: '',
    summary: project.summary || '',
    problem: 'This project is addressing a community challenge identified during the inBestmen intake process.',
    beneficiaries: 'The communities and people described in the project proposal.',
    proposedSolution: project.summary || '',
    stage: project.status || 'Community review',
    team: 'The founding team information will be updated as the project progresses.',
    budgetUsd: Number(project.ibGoal || 0),
    impact: 'Progress and outcomes will be shared with the community as the project advances.',
    timeline: 'The project roadmap will be updated by the project team.',
    risks: 'Delivery, funding and execution risks remain subject to human review and project updates.',
    strengths: [project.summary || 'A project shared with the inBestmen community.']
});

function normalizeProject(project) {
    const ibRaised = Math.max(0, Number(String(project.ibRaised ?? project.coins ?? 0).replace(/,/g, '')) || 0);
    const ibGoal = Math.max(0, Number(String(project.ibGoal ?? project.goal ?? 0).replace(/,/g, '')) || 0);
    return {
        ...project,
        id: String(project.id || '').trim(),
        ibRaised,
        ibGoal,
        progress: ibGoal ? Math.min(100, Math.round((ibRaised / ibGoal) * 100)) : 0,
        proposalUrl: Object.prototype.hasOwnProperty.call(project, 'proposalUrl') ? (project.proposalUrl || '') : (project.url || (project.id ? `project-proposal.html?id=${encodeURIComponent(project.id)}` : '')),
        publicBrief: project.publicBrief || defaultPublicBrief({ ...project, ibGoal })
    };
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}

function proposalHref(project) {
    const value = String(project.proposalUrl || '').trim();
    if (!value) return '';
    if (/^https:\/\//i.test(value) || /^(?:project-proposal\.html|https?:\/\/)/i.test(value)) return value;
    return '';
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-US');
}

const setUser = (user) => {
    const name = user?.displayName || user?.email?.split('@')[0] || 'Member';
    const email = user?.email || 'Sign in required';
    userName.textContent = name;
    userEmail.textContent = email;
    welcomeName.textContent = name.split(' ')[0];
    userAvatar.textContent = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
};

setUser(null);

const showToast = (message) => {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 3500);
};

const setPaymentNote = (message, tone = '') => {
    const note = document.getElementById('paymentNote');
    note.innerHTML = `<i class="bi bi-${tone === 'error' ? 'exclamation-triangle' : tone === 'success' ? 'check-circle' : 'lock'}"></i> ${escapeHtml(message)}`;
    note.className = `payment-note${tone ? ` ${tone}` : ''}`;
};

const setWalletBalance = (balance) => {
    walletBalance = Math.max(0, Number(balance || 0));
    document.querySelectorAll('.balance-value').forEach((element) => { element.textContent = formatNumber(walletBalance); });
    document.getElementById('balanceAmount').textContent = formatNumber(walletBalance);
    const modalBalance = document.getElementById('projectModalWallet');
    if (modalBalance) modalBalance.textContent = formatNumber(walletBalance);
};

const renderNetworkStats = (stats = {}) => {
    const values = {
        memberApprovedProjects: Number(stats.approvedProjects || 0),
        memberConnectedCountries: Number(stats.connectedCountries || 0),
        memberCommunityMembers: Number(stats.communityMembers || 0),
        memberTotalDonated: Number(stats.totalDonatedIb || 0)
    };
    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = formatNumber(value);
    });
};

const loadNetworkStats = async () => {
    try {
        const response = await fetch('/api/projects/public?limit=100', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Network data unavailable (${response.status}).`);
        renderNetworkStats(data.stats || {});
    } catch (error) {
        renderNetworkStats();
        console.warn(error);
    }
};

const projectCard = (project, isFuture = false) => {
    const progress = Math.min(100, Number(project.progress ?? 0));
    const href = proposalHref(project);
    const proposal = href ? `<a class="btn btn-outline-dark" href="${escapeHtml(href)}"${/^https:\/\//i.test(href) ? ' target="_blank" rel="noopener"' : ''}>View proposal <i class="bi bi-arrow-up-right"></i></a>` : '';
    const goalReached = progress >= 100;
    const donationControls = !isFuture && project.id ? `<div class="donation-controls"><label class="visually-hidden" for="donation-${escapeHtml(project.id)}">iB Coins to donate to ${escapeHtml(project.name)}</label><select id="donation-${escapeHtml(project.id)}" class="donation-amount" data-donation-amount-for="${escapeHtml(project.id)}" aria-label="iB Coins to donate"><option value="1">1 iB</option><option value="2">2 iB</option><option value="5">5 iB</option><option value="10">10 iB</option><option value="25">25 iB</option><option value="50">50 iB</option></select><button class="btn btn-primary" data-donate="${escapeHtml(project.id)}" type="button"${goalReached ? ' disabled' : ''}>${goalReached ? 'Goal reached' : 'Donate'} <i class="bi bi-arrow-right"></i></button></div>` : '';
    const openProject = project.id ? `<button class="btn btn-outline-dark" data-open-project="${escapeHtml(project.id)}" type="button">Open project <i class="bi bi-arrow-up-right"></i></button>` : '';
    return `<article class="dashboard-project"><div class="project-visual ${escapeHtml(project.visual || 'visual-education')}"><span class="project-category">${escapeHtml(project.category)}</span><span class="project-icon"><i class="bi ${escapeHtml(project.icon || 'bi-globe')}"></i></span></div><div class="dashboard-project-body"><span class="project-status">${escapeHtml(project.status || 'Community vote open')}</span><h3>${escapeHtml(project.name)}</h3><div class="project-location"><i class="bi bi-geo-alt"></i> ${escapeHtml(project.location)}</div><p class="project-summary">${escapeHtml(project.summary)}</p><div class="project-progress-head"><span><strong>${formatNumber(project.ibRaised)}</strong> iB Coins</span><span>${progress}% of goal</span></div><div class="project-progress"><span style="width:${progress}%"></span></div><div class="project-progress-foot"><span>Goal ${formatNumber(project.ibGoal)} iB</span><strong>${isFuture || goalReached ? 'Completed' : 'Accepting support'}</strong></div><div class="project-card-actions"><div class="project-card-links"><button class="listen-button" data-listen="${escapeHtml(project.name)}" type="button"><i class="bi bi-volume-up"></i> Listen to story</button>${openProject}${proposal}</div>${isFuture ? '<span class="text-muted small">Community milestone</span>' : donationControls}</div></div></article>`;
};

const renderMyProjects = () => {
    const selected = projects.filter((project) => supported.includes(project.id));
    myProjectGrid.innerHTML = selected.map((project) => projectCard(project)).join('');
    document.getElementById('myEmptyState').classList.toggle('show', selected.length === 0);
};

const bindProjectActions = () => {
    document.querySelectorAll('[data-listen]').forEach((button) => button.addEventListener('click', () => showToast(`ElevenLabs project narration for ${button.dataset.listen} will play here once the project audio is published.`)));
    document.querySelectorAll('[data-open-project]').forEach((button) => button.addEventListener('click', () => openProjectModal(button.dataset.openProject, button)));
    document.querySelectorAll('[data-donate]').forEach((button) => button.addEventListener('click', () => handleDonation(button.dataset.donate, button)));
};

const renderProjects = () => {
    projectGrid.innerHTML = projects.map((project) => projectCard(project)).join('');
    projectEmptyState.classList.toggle('show', projects.length === 0);
    futureGrid.innerHTML = '';
    futureEmptyState.classList.add('show');
    renderMyProjects();
    bindProjectActions();
};

renderProjects();
loadNetworkStats();

const apiFetch = async (path, options = {}) => {
    if (!currentUser) throw new Error('Sign in to use your inBestmen wallet.');
    const token = await currentUser.getIdToken();
    const response = await fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    return body;
};

const loadWallet = async () => {
    try {
        const data = await apiFetch('/api/wallet');
        setWalletBalance(data.wallet?.ibBalance || 0);
    } catch (error) {
        setPaymentNote(error.message || 'Your wallet could not be loaded.', 'error');
    }
};

const loadProjects = async () => {
    try {
        const data = await apiFetch('/api/projects/list');
        if (Array.isArray(data.projects)) {
            projects = data.projects.map(normalizeProject);
            renderProjects();
        }
    } catch (error) {
        projects = [];
        renderProjects();
        showToast('The project catalog is temporarily unavailable.');
        console.warn(error);
    }
};

const loadSupportedProjects = async () => {
    try {
        const data = await apiFetch('/api/projects/support');
        supported = (Array.isArray(data.support) ? data.support : []).filter((item) => Number(item.ibDonated || 0) > 0).map((item) => String(item.projectId || item.id));
        renderProjects();
    } catch (error) {
        console.warn(error);
    }
};

const modalValue = (value, fallback = 'Not captured') => {
    if (Array.isArray(value)) return value.length ? value.join(', ') : fallback;
    return String(value ?? '').trim() || fallback;
};

const openProjectModal = (projectId, trigger = null) => {
    const project = projects.find((item) => item.id === String(projectId));
    if (!project) return showToast('That project packet is not available right now.');
    const details = project.publicBrief || defaultPublicBrief(project);
    const progress = Math.min(100, Number(project.progress ?? 0));
    const modal = document.getElementById('projectModal');
    const proposal = document.getElementById('projectModalProposal');
    const donateArea = document.getElementById('projectModalDonateArea');
    const donateButton = document.getElementById('modalDonateButton');
    const proposalUrl = proposalHref(project);
    modalProjectId = project.id;
    lastFocusedElement = trigger || document.activeElement;
    document.getElementById('projectModalCategory').textContent = project.category || 'Project proposal';
    document.getElementById('projectModalName').textContent = project.name || 'Project packet';
    document.getElementById('projectModalLocation').textContent = project.location || 'Location not captured';
    document.getElementById('projectModalStatus').textContent = project.status || 'Community project';
    document.getElementById('projectModalSummary').textContent = details.summary || project.summary || 'No public summary has been published yet.';
    document.getElementById('projectModalProgress').textContent = `${progress}%`;
    document.getElementById('projectModalBar').style.width = `${progress}%`;
    document.getElementById('projectModalRaised').textContent = `${formatNumber(project.ibRaised)} iB Coins`;
    document.getElementById('projectModalGoal').textContent = `Goal ${formatNumber(project.ibGoal)} iB`;
    const fields = [
        ['Founder', details.founderName],
        ['Problem', details.problem],
        ['Beneficiaries', details.beneficiaries],
        ['Proposed solution', details.proposedSolution],
        ['Current stage', details.stage],
        ['Team', details.team],
        ['Expected impact', details.impact],
        ['Timeline', details.timeline],
        ['Risks and considerations', details.risks]
    ];
    document.getElementById('projectModalDetails').innerHTML = fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><p>${escapeHtml(modalValue(value))}</p></div>`).join('');
    document.getElementById('projectModalAiSummary').textContent = details.summary || 'No screening summary has been published yet.';
    const strengths = Array.isArray(details.strengths) ? details.strengths.filter(Boolean) : [];
    document.getElementById('projectModalStrengths').innerHTML = strengths.length ? `<ul>${strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<span>No strengths were published in this packet.</span>';
    document.getElementById('projectModalJson').textContent = JSON.stringify({ project: { id: project.id, name: project.name, category: project.category, location: project.location, status: project.status, ibRaised: project.ibRaised, ibGoal: project.ibGoal }, publicBrief: details }, null, 2);
    proposal.hidden = !proposalUrl;
    if (proposalUrl) proposal.href = proposalUrl;
    donateArea.hidden = progress >= 100;
    donateButton.disabled = progress >= 100;
    donateButton.dataset.modalDonate = 'true';
    donateButton.textContent = progress >= 100 ? 'Goal reached' : 'Donate iB Coins';
    const icon = document.createElement('i');
    icon.className = 'bi bi-arrow-right';
    donateButton.append(' ', icon);
    document.getElementById('projectModalWallet').textContent = formatNumber(walletBalance);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('project-modal-open');
    document.getElementById('closeProjectModal').focus();
};

const closeProjectModal = () => {
    const modal = document.getElementById('projectModal');
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('project-modal-open');
    modalProjectId = '';
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
};

const updateProjectFromDonation = (projectData) => {
    const donatedProject = normalizeProject({ ...projectData, ibRaised: projectData.ibRaised ?? projectData.coins, ibGoal: projectData.ibGoal ?? projectData.goal });
    projects = projects.map((project) => project.id === donatedProject.id ? { ...project, ...donatedProject, ibRaised: donatedProject.ibRaised || project.ibRaised, ibGoal: donatedProject.ibGoal || project.ibGoal } : project);
    if (!projects.some((project) => project.id === donatedProject.id)) projects = [...projects, donatedProject];
    supported = Array.from(new Set([...supported, donatedProject.id]));
};

const handleDonation = async (projectId, button) => {
    const select = button.dataset.modalDonate ? document.getElementById('modalDonationAmount') : Array.from(document.querySelectorAll('[data-donation-amount-for]')).find((item) => item.dataset.donationAmountFor === projectId);
    const amount = Number(select?.value || 0);
    if (!Number.isInteger(amount) || amount < 1) return;
    button.disabled = true;
    try {
        const result = await apiFetch('/api/projects/donate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, amount }) });
        setWalletBalance(result.wallet?.ibBalance || 0);
        updateProjectFromDonation(result.project);
        renderProjects();
        if (!document.getElementById('projectModal').hidden) openProjectModal(projectId);
        showToast(`${amount} iB Coins sent to ${result.project?.name || 'the project'}.`);
    } catch (error) {
        showToast(error.message || 'The donation could not be completed.');
        setPaymentNote(error.message || 'The donation could not be completed.', 'error');
    } finally {
        button.disabled = false;
    }
};

const loadPayPalSdk = (paypalConfig) => {
    if (window.paypal) return Promise.resolve(window.paypal);
    if (paypalSdkPromise) return paypalSdkPromise;
    paypalSdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = 'paypal-js-sdk';
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(paypalConfig.clientId)}&currency=${encodeURIComponent(paypalConfig.currency)}&intent=capture&components=buttons`;
        script.onload = () => resolve(window.paypal);
        script.onerror = () => reject(new Error('PayPal checkout could not be loaded.'));
        document.head.appendChild(script);
    });
    return paypalSdkPromise;
};

const loadPayPalCheckout = async () => {
    if (!currentUser || paypalRendered) return;
    const container = document.getElementById('paypalButtonContainer');
    try {
        const paypalConfig = await apiFetch('/api/paypal/config');
        const paypal = await loadPayPalSdk(paypalConfig);
        if (!paypal?.Buttons) throw new Error('PayPal checkout is unavailable right now.');
        container.hidden = false;
        await paypal.Buttons({
            style: { layout: 'vertical', shape: 'rect', label: 'paypal', height: 42 },
            createOrder: async () => {
                setPaymentNote(`Creating your $${selectedAmount} PayPal order…`);
                const data = await apiFetch('/api/paypal/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: selectedAmount }) });
                return data.orderId;
            },
            onApprove: async (data) => {
                setPaymentNote('Verifying your PayPal payment and adding iB Coins to your wallet…');
                const result = await apiFetch('/api/paypal/capture-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: data.orderID }) });
                setWalletBalance(result.wallet?.ibBalance || 0);
                setPaymentNote(`${result.coins} iB Coins added securely to your wallet.`, 'success');
                showToast(`${result.coins} iB Coins added to your wallet.`);
            },
            onCancel: () => setPaymentNote('Payment cancelled. Choose a package whenever you are ready.'),
            onError: (error) => { console.error(error); setPaymentNote('PayPal could not complete this checkout. No iB Coins were added.', 'error'); }
        }).render(container);
        paypalRendered = true;
        setPaymentNote(`PayPal is ready. Selected package: $${selectedAmount} = ${selectedAmount} iB Coins.`);
    } catch (error) {
        container.hidden = true;
        setPaymentNote(error.message || 'PayPal checkout is not configured yet.', 'error');
    }
};

const setView = (view, updateHash = true) => {
    const validView = Array.from(document.querySelectorAll('.dashboard-view')).some((panel) => panel.dataset.viewPanel === view) ? view : 'overview';
    document.querySelectorAll('.dashboard-view').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === validView));
    document.querySelectorAll('.dashboard-nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === validView));
    document.getElementById('pageTitle').textContent = Array.from(document.querySelectorAll('.dashboard-nav-link')).find((link) => link.dataset.view === validView)?.querySelector('span')?.textContent || 'Home';
    if (updateHash) window.history.replaceState(null, '', `#${validView}`);
    document.getElementById('dashboardSidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

if (!auth) {
    window.location.replace('auth.html');
} else onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        setUser(user);
        loadWallet();
        loadPayPalCheckout();
        loadProjects();
        loadSupportedProjects();
    } else {
        window.location.href = 'auth.html';
    }
});

document.querySelectorAll('.dashboard-nav-link').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); setView(link.dataset.view); }));
document.querySelectorAll('[data-open-view]').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); setView(button.dataset.openView); }));
document.querySelectorAll('[data-amount]').forEach((button) => button.addEventListener('click', () => {
    selectedAmount = Number(button.dataset.amount);
    document.querySelectorAll('[data-amount]').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    setPaymentNote(`PayPal is ready. Selected package: $${selectedAmount} = ${selectedAmount} iB Coins.`);
}));
document.querySelector('[data-amount="1"]')?.classList.add('selected');
document.querySelectorAll('[data-coming-soon]').forEach((button) => button.addEventListener('click', () => showToast('Transaction history will be connected to Firebase and PayPal in the next build.')));
document.getElementById('closeProjectModal').addEventListener('click', closeProjectModal);
document.querySelector('[data-close-project]').addEventListener('click', closeProjectModal);
document.getElementById('modalDonateButton').addEventListener('click', (event) => { if (modalProjectId) handleDonation(modalProjectId, event.currentTarget); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !document.getElementById('projectModal').hidden) closeProjectModal(); });
document.getElementById('sidebarOpen').addEventListener('click', () => document.getElementById('dashboardSidebar').classList.add('open'));
document.getElementById('sidebarClose').addEventListener('click', () => document.getElementById('dashboardSidebar').classList.remove('open'));
document.getElementById('signOut').addEventListener('click', async () => { if (auth) await signOut(auth); window.location.href = 'auth.html'; });
window.addEventListener('hashchange', () => setView(window.location.hash.slice(1), false));
setView(window.location.hash.slice(1) || 'overview', false);
