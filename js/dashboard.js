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
let demoMode = false;
let demoSnapshot = null;

const demoUser = JSON.parse(localStorage.getItem('inbestmen_user') || '{"name":"Preview Member","email":"Preview mode"}');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const welcomeName = document.getElementById('welcomeName');
const userAvatar = document.getElementById('userAvatar');
const projectGrid = document.getElementById('projectGrid');
const myProjectGrid = document.getElementById('myProjectGrid');
const futureGrid = document.getElementById('futureGrid');

const initialProjects = [
    { id: 'invest-in-inbest', name: 'Invest in inBest', category: 'Global organization', location: 'Worldwide', summary: 'The first official inBestmen campaign: build the people, technology and trust layer for a global social investment platform.', ibRaised: 12500, ibGoal: 1000000, visual: 'visual-education', icon: 'bi-globe', status: 'Example launch proposal', proposalUrl: 'https://inbestproject.wstudio3d.com/', demo: true },
    { id: 'blueloop', name: 'BlueLoop', category: 'Water / Climate', location: 'Nairobi, Kenya', summary: 'Solar-powered water kiosks with local ownership for neighborhoods existing infrastructure misses.', ibRaised: 8640, ibGoal: 12000, visual: 'visual-water', icon: 'bi-droplet-half', status: 'Example community vote', proposalUrl: 'project-proposal.html?id=blueloop', demo: true },
    { id: 'orbit-school', name: 'Orbit School', category: 'Education / AI', location: 'Medellín, Colombia', summary: 'A low-bandwidth learning network that gives young people a personal guide to new skills.', ibRaised: 5230, ibGoal: 10000, visual: 'visual-education', icon: 'bi-stars', status: 'Example community vote', proposalUrl: 'project-proposal.html?id=orbit-school', demo: true },
    { id: 'root-rise', name: 'Root & Rise', category: 'Food / Regeneration', location: 'Lisbon, Portugal', summary: 'Turning small urban spaces into productive, community-owned food gardens.', ibRaised: 3980, ibGoal: 8000, visual: 'visual-food', icon: 'bi-flower1', status: 'Example community vote', proposalUrl: 'project-proposal.html?id=root-rise', demo: true },
    { id: 'care-circle', name: 'Care Circle', category: 'Health / Wellbeing', location: 'Manila, Philippines', summary: 'A neighborhood care network that makes practical support easier to find and share.', ibRaised: 6710, ibGoal: 9000, visual: 'visual-health', icon: 'bi-heart-pulse', status: 'Example community vote', proposalUrl: 'project-proposal.html?id=care-circle', demo: true }
];

const finished = [
    { id: 'solar-commons', name: 'Solar Commons', category: 'Energy / Community', location: 'Mombasa, Kenya', summary: 'Community-owned solar charging hubs are now serving three neighborhoods.', ibRaised: 14200, ibGoal: 14000, visual: 'visual-water', icon: 'bi-sun', status: 'Goal reached', proposalUrl: 'project-proposal.html?id=solar-commons' },
    { id: 'makers-of-tomorrow', name: 'Makers of Tomorrow', category: 'Education / Access', location: 'Oaxaca, Mexico', summary: 'A shared workshop now gives local makers tools, training and a place to teach.', ibRaised: 9800, ibGoal: 9800, visual: 'visual-education', icon: 'bi-lightbulb', status: 'Goal reached', proposalUrl: 'project-proposal.html?id=makers-of-tomorrow' }
];

let projects = initialProjects.map(normalizeProject);
let supported = JSON.parse(localStorage.getItem('inbestmen_supported_projects') || '[]');
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
    const name = user?.displayName || user?.email?.split('@')[0] || demoUser.name;
    const email = user?.email || demoUser.email;
    userName.textContent = name;
    userEmail.textContent = email;
    welcomeName.textContent = name.split(' ')[0];
    userAvatar.textContent = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
};

setUser(configReady ? null : demoUser);

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

const setDemoNote = () => {
    const note = document.getElementById('demoModeNote');
    const button = document.getElementById('demoWalletButton');
    if (note) {
        note.hidden = !demoMode;
        note.textContent = demoMode ? 'Example mode only — this wallet and these donations do not move real money.' : '';
    }
    if (button) button.textContent = demoMode ? 'Exit sample wallet' : 'Try sample wallet';
};

const setWalletBalance = (balance) => {
    walletBalance = Math.max(0, Number(balance || 0));
    document.querySelectorAll('.balance-value').forEach((element) => { element.textContent = formatNumber(walletBalance); });
    document.getElementById('balanceAmount').textContent = formatNumber(walletBalance);
    const modalBalance = document.getElementById('projectModalWallet');
    if (modalBalance) modalBalance.textContent = formatNumber(walletBalance);
};

const updateImpact = () => {
    document.getElementById('impactProjects').textContent = supported.length;
};

const projectCard = (project, isFuture = false) => {
    const progress = Math.min(100, Number(project.progress ?? 0));
    const href = proposalHref(project);
    const proposal = href ? `<a class="btn btn-outline-dark" href="${escapeHtml(href)}"${/^https:\/\//i.test(href) ? ' target="_blank" rel="noopener"' : ''}>View proposal <i class="bi bi-arrow-up-right"></i></a>` : '';
    const goalReached = progress >= 100;
    const donationControls = !isFuture && project.id ? `<div class="donation-controls"><label class="visually-hidden" for="donation-${escapeHtml(project.id)}">iB Coins to donate to ${escapeHtml(project.name)}</label><select id="donation-${escapeHtml(project.id)}" class="donation-amount" data-donation-amount-for="${escapeHtml(project.id)}" aria-label="iB Coins to donate"><option value="1">1 iB</option><option value="2">2 iB</option><option value="5">5 iB</option><option value="10">10 iB</option><option value="25">25 iB</option><option value="50">50 iB</option></select><button class="btn btn-primary" data-donate="${escapeHtml(project.id)}" type="button"${goalReached ? ' disabled' : ''}>${goalReached ? 'Goal reached' : 'Donate'} <i class="bi bi-arrow-right"></i></button></div>` : '';
    const openProject = project.id ? `<button class="btn btn-outline-dark" data-open-project="${escapeHtml(project.id)}" type="button">Open project <i class="bi bi-arrow-up-right"></i></button>` : '';
    return `<article class="dashboard-project"><div class="project-visual ${escapeHtml(project.visual || 'visual-education')}"><span class="project-category">${escapeHtml(project.category)}</span><span class="project-icon"><i class="bi ${escapeHtml(project.icon || 'bi-globe')}"></i></span></div><div class="dashboard-project-body"><span class="project-status">${escapeHtml(project.status || (project.demo ? 'Example project' : 'Community vote open'))}</span><h3>${escapeHtml(project.name)}</h3><div class="project-location"><i class="bi bi-geo-alt"></i> ${escapeHtml(project.location)}</div><p class="project-summary">${escapeHtml(project.summary)}</p><div class="project-progress-head"><span><strong>${formatNumber(project.ibRaised)}</strong> iB Coins</span><span>${progress}% of goal</span></div><div class="project-progress"><span style="width:${progress}%"></span></div><div class="project-progress-foot"><span>Goal ${formatNumber(project.ibGoal)} iB</span><strong>${isFuture || goalReached ? 'Completed' : 'Accepting support'}</strong></div><div class="project-card-actions"><div class="project-card-links"><button class="listen-button" data-listen="${escapeHtml(project.name)}" type="button"><i class="bi bi-volume-up"></i> Listen to story</button>${openProject}${proposal}</div>${isFuture ? '<span class="text-muted small">Community milestone</span>' : donationControls}</div></div></article>`;
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
    futureGrid.innerHTML = finished.map((project) => projectCard(normalizeProject(project), true)).join('');
    renderMyProjects();
    bindProjectActions();
    updateImpact();
};

renderProjects();

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
        showToast('Showing the project catalog. Live project data will appear when Firestore is connected.');
        console.warn(error);
    }
};

const loadSupportedProjects = async () => {
    try {
        const data = await apiFetch('/api/projects/support');
        supported = (Array.isArray(data.support) ? data.support : []).filter((item) => Number(item.ibDonated || 0) > 0).map((item) => String(item.projectId || item.id));
        localStorage.setItem('inbestmen_supported_projects', JSON.stringify(supported));
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
    const project = [...projects, ...finished.map(normalizeProject)].find((item) => item.id === String(projectId));
    if (!project) return showToast('That project packet is not available right now.');
    const details = project.publicBrief || defaultPublicBrief(project);
    const progress = Math.min(100, Number(project.progress ?? 0));
    const isFuture = finished.some((item) => item.id === project.id);
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
    donateArea.hidden = isFuture;
    donateButton.disabled = isFuture || progress >= 100;
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
    localStorage.setItem('inbestmen_supported_projects', JSON.stringify(supported));
};

const handleDemoDonation = (projectId, amount) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) throw new Error('That project is not available.');
    if (amount > walletBalance) throw new Error(`Your sample wallet has ${walletBalance} iB Coins available.`);
    if (project.ibGoal && project.ibRaised + amount > project.ibGoal) throw new Error(`Only ${project.ibGoal - project.ibRaised} iB Coins remain before this project reaches its goal.`);
    projects = projects.map((item) => item.id === projectId ? normalizeProject({ ...item, ibRaised: item.ibRaised + amount }) : item);
    setWalletBalance(walletBalance - amount);
    updateProjectFromDonation(projects.find((item) => item.id === projectId));
    renderProjects();
    showToast(`${amount} iB Coins added to ${project.name}. Example mode only.`);
};

const handleDonation = async (projectId, button) => {
    const select = button.dataset.modalDonate ? document.getElementById('modalDonationAmount') : document.querySelector(`[data-donation-amount-for="${CSS.escape(projectId)}"]`);
    const amount = Number(select?.value || 0);
    if (!Number.isInteger(amount) || amount < 1) return;
    button.disabled = true;
    try {
        if (demoMode) {
            handleDemoDonation(projectId, amount);
            if (!document.getElementById('projectModal').hidden) openProjectModal(projectId);
            return;
        }
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

const enterDemoWallet = () => {
    demoSnapshot = { projects, supported: [...supported], walletBalance };
    demoMode = true;
    setWalletBalance(21);
    renderProjects();
    setDemoNote();
    showToast('Sample wallet loaded with 21 iB Coins. Choose a project to test a fictional donation.');
};

const exitDemoWallet = () => {
    if (!demoSnapshot) return;
    ({ projects, supported, walletBalance } = demoSnapshot);
    demoSnapshot = null;
    demoMode = false;
    setWalletBalance(walletBalance);
    renderProjects();
    setDemoNote();
    if (currentUser) loadWallet();
    showToast('Returned to your real wallet.');
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
    const validView = document.querySelector(`[data-view-panel="${CSS.escape(view)}"]`) ? view : 'overview';
    document.querySelectorAll('.dashboard-view').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === validView));
    document.querySelectorAll('.dashboard-nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === validView));
    document.getElementById('pageTitle').textContent = document.querySelector(`[data-view="${CSS.escape(validView)}"] span`)?.textContent || 'Home';
    if (updateHash) window.history.replaceState(null, '', `#${validView}`);
    document.getElementById('dashboardSidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

if (auth) onAuthStateChanged(auth, (user) => {
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

document.querySelectorAll('.dashboard-nav-link').forEach((link) => link.addEventListener('click', () => setView(link.dataset.view)));
document.querySelectorAll('[data-open-view]').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); setView(button.dataset.openView); }));
document.querySelectorAll('[data-amount]').forEach((button) => button.addEventListener('click', () => {
    selectedAmount = Number(button.dataset.amount);
    document.querySelectorAll('[data-amount]').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    setPaymentNote(`PayPal is ready. Selected package: $${selectedAmount} = ${selectedAmount} iB Coins.`);
}));
document.querySelector('[data-amount="1"]')?.classList.add('selected');
document.querySelectorAll('[data-coming-soon]').forEach((button) => button.addEventListener('click', () => showToast('Transaction history will be connected to Firebase and PayPal in the next build.')));
document.getElementById('demoWalletButton')?.addEventListener('click', () => demoMode ? exitDemoWallet() : enterDemoWallet());
document.getElementById('closeProjectModal').addEventListener('click', closeProjectModal);
document.querySelector('[data-close-project]').addEventListener('click', closeProjectModal);
document.getElementById('modalDonateButton').addEventListener('click', (event) => { if (modalProjectId) handleDonation(modalProjectId, event.currentTarget); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !document.getElementById('projectModal').hidden) closeProjectModal(); });
document.getElementById('sidebarOpen').addEventListener('click', () => document.getElementById('dashboardSidebar').classList.add('open'));
document.getElementById('sidebarClose').addEventListener('click', () => document.getElementById('dashboardSidebar').classList.remove('open'));
document.getElementById('signOut').addEventListener('click', async () => { if (auth) await signOut(auth); localStorage.removeItem('inbestmen_user'); window.location.href = 'auth.html'; });
window.addEventListener('hashchange', () => setView(window.location.hash.slice(1), false));
setDemoNote();
setView(window.location.hash.slice(1) || 'overview', false);
