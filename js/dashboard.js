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

const demoUser = JSON.parse(localStorage.getItem('inbestmen_user') || '{"name":"Guest Member","email":"Preview mode"}');
const userName = document.getElementById('userName'); const userEmail = document.getElementById('userEmail'); const welcomeName = document.getElementById('welcomeName'); const userAvatar = document.getElementById('userAvatar');
const setUser = (user) => { const name = user?.displayName || user?.email?.split('@')[0] || demoUser.name; const email = user?.email || demoUser.email; userName.textContent = name; userEmail.textContent = email; welcomeName.textContent = name.split(' ')[0]; userAvatar.textContent = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(); };
setUser(configReady ? null : demoUser);

if (auth) onAuthStateChanged(auth, (user) => { if (user) { currentUser = user; setUser(user); loadWallet(); loadPayPalCheckout(); } else { window.location.href = 'auth.html'; } });

const projects = [
    { id: 'invest-in-inbest', name: 'Invest in inBest', category: 'Global organization', location: 'Worldwide', summary: 'The first official inBestmen campaign: build the people, technology and trust layer for a global social investment platform.', coins: '0', goal: '1,000,000', progress: 0, visual: 'visual-education', icon: 'bi-globe', status: 'Official launch proposal', url: 'https://inbestproject.wstudio3d.com/' },
    { id: 'blueloop', name: 'BlueLoop', category: 'Water / Climate', location: 'Nairobi, Kenya', summary: 'Solar-powered water kiosks with local ownership for neighborhoods existing infrastructure misses.', coins: '8,640', goal: '12,000', progress: 72, visual: 'visual-water', icon: 'bi-droplet-half', status: 'Community vote open' },
    { id: 'orbit-school', name: 'Orbit School', category: 'Education / AI', location: 'Medellín, Colombia', summary: 'A low-bandwidth learning network that gives young people a personal guide to new skills.', coins: '5,230', goal: '10,000', progress: 52, visual: 'visual-education', icon: 'bi-stars', status: 'Community vote open' },
    { id: 'root-rise', name: 'Root & Rise', category: 'Food / Regeneration', location: 'Lisbon, Portugal', summary: 'Turning small urban spaces into productive, community-owned food gardens.', coins: '3,980', goal: '8,000', progress: 49, visual: 'visual-food', icon: 'bi-flower1', status: 'Community vote open' },
    { id: 'care-circle', name: 'Care Circle', category: 'Health / Wellbeing', location: 'Manila, Philippines', summary: 'A neighborhood care network that makes practical support easier to find and share.', coins: '6,710', goal: '9,000', progress: 75, visual: 'visual-health', icon: 'bi-heart-pulse', status: 'Community vote open' }
];
const finished = [
    { name: 'Solar Commons', category: 'Energy / Community', location: 'Mombasa, Kenya', summary: 'Community-owned solar charging hubs are now serving three neighborhoods.', coins: '14,200', goal: '14,000', progress: 100, visual: 'visual-water', icon: 'bi-sun', status: 'Goal reached' },
    { name: 'Makers of Tomorrow', category: 'Education / Access', location: 'Oaxaca, Mexico', summary: 'A shared workshop now gives local makers tools, training and a place to teach.', coins: '9,800', goal: '9,800', progress: 100, visual: 'visual-education', icon: 'bi-lightbulb', status: 'Goal reached' }
];
let supported = JSON.parse(localStorage.getItem('inbestmen_supported_projects') || '[]');

const projectCard = (project, isFuture = false) => `<article class="dashboard-project"><div class="project-visual ${project.visual}"><span class="project-category">${project.category}</span><span class="project-icon"><i class="bi ${project.icon}"></i></span></div><div class="dashboard-project-body"><span class="project-status">${project.status}</span><h3>${project.name}</h3><div class="project-location"><i class="bi bi-geo-alt"></i> ${project.location}</div><p class="project-summary">${project.summary}</p><div class="project-progress-head"><span><strong>${project.coins}</strong> iB Coins</span><span>${project.progress}% of goal</span></div><div class="project-progress"><span style="width:${project.progress}%"></span></div><div class="project-progress-foot"><span>Goal ${project.goal} iB</span><strong>${isFuture ? 'Completed' : 'Accepting support'}</strong></div><div class="project-card-actions"><button class="listen-button" data-listen="${project.name}"><i class="bi bi-volume-up"></i> Listen to story</button>${project.url ? `<a class="btn btn-outline-dark" href="${project.url}" target="_blank" rel="noopener">View proposal</a>` : isFuture ? '<span class="text-muted small">Community milestone</span>' : `<button class="btn btn-primary" data-support="${project.id}">${supported.includes(project.id) ? 'Supported ✓' : 'Support project'}</button>`}</div></div></article>`;
const projectGrid = document.getElementById('projectGrid'); const myProjectGrid = document.getElementById('myProjectGrid'); const futureGrid = document.getElementById('futureGrid');
projectGrid.innerHTML = projects.map(projectCard).join(''); futureGrid.innerHTML = finished.map((project) => projectCard(project, true)).join('');
const renderMyProjects = () => { const selected = projects.filter((project) => supported.includes(project.id)); myProjectGrid.innerHTML = selected.map(projectCard).join(''); document.getElementById('myEmptyState').classList.toggle('show', selected.length === 0); };
renderMyProjects();

const showToast = (message) => { const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('show'); window.setTimeout(() => toast.classList.remove('show'), 3500); };
const setPaymentNote = (message, tone = '') => { const note = document.getElementById('paymentNote'); note.innerHTML = `<i class="bi bi-${tone === 'error' ? 'exclamation-triangle' : tone === 'success' ? 'check-circle' : 'lock'}"></i> ${message}`; note.className = `payment-note${tone ? ` ${tone}` : ''}`; };
const setWalletBalance = (balance) => { document.querySelectorAll('.balance-value').forEach((element) => { element.textContent = Number(balance || 0).toLocaleString(); }); document.getElementById('balanceAmount').textContent = Number(balance || 0).toLocaleString(); };
const apiFetch = async (path, options = {}) => { if (!currentUser) throw new Error('Sign in to use your inBestmen wallet.'); const token = await currentUser.getIdToken(); const response = await fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, Accept: 'application/json' } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`); return body; };
const loadWallet = async () => { try { const data = await apiFetch('/api/wallet'); setWalletBalance(data.wallet?.ibBalance || 0); } catch (error) { setPaymentNote(error.message || 'Your wallet could not be loaded.', 'error'); } };
const loadPayPalSdk = (config) => {
    if (window.paypal) return Promise.resolve(window.paypal);
    if (paypalSdkPromise) return paypalSdkPromise;
    paypalSdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = 'paypal-js-sdk';
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=${encodeURIComponent(config.currency)}&intent=capture&components=buttons`;
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
        const config = await apiFetch('/api/paypal/config');
        const paypal = await loadPayPalSdk(config);
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
const setView = (view) => { document.querySelectorAll('.dashboard-view').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === view)); document.querySelectorAll('.dashboard-nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === view)); const active = document.querySelector(`[data-view-panel="${view}"]`); document.getElementById('pageTitle').textContent = document.querySelector(`[data-view="${view}"] span`)?.textContent || 'Home'; window.scrollTo({ top: 0, behavior: 'smooth' }); if (active) active.querySelectorAll('[data-support]').forEach(bindSupport); };
document.querySelectorAll('.dashboard-nav-link').forEach((link) => link.addEventListener('click', () => setView(link.dataset.view)));
document.querySelectorAll('[data-open-view]').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); setView(button.dataset.openView); }));
const bindSupport = (button) => button.addEventListener('click', () => { const id = button.dataset.support; if (!supported.includes(id)) { supported.push(id); localStorage.setItem('inbestmen_supported_projects', JSON.stringify(supported)); renderMyProjects(); document.getElementById('impactProjects').textContent = supported.length; showToast('Project added to My inBest. Your signal is now part of its journey.'); button.textContent = 'Supported ✓'; } });
document.querySelectorAll('[data-support]').forEach(bindSupport);
document.querySelectorAll('[data-listen]').forEach((button) => button.addEventListener('click', () => showToast(`ElevenLabs project narration for ${button.dataset.listen} will play here once the agent is connected.`)));
document.querySelectorAll('[data-amount]').forEach((button) => button.addEventListener('click', () => { selectedAmount = Number(button.dataset.amount); document.querySelectorAll('[data-amount]').forEach((item) => item.classList.remove('selected')); button.classList.add('selected'); setPaymentNote(`PayPal is ready. Selected package: $${selectedAmount} = ${selectedAmount} iB Coins.`); }));
document.querySelector('[data-amount="1"]')?.classList.add('selected');
document.querySelectorAll('[data-coming-soon]').forEach((button) => button.addEventListener('click', () => showToast('Transaction history will be connected to Firebase and PayPal in the next build.')));
document.getElementById('impactProjects').textContent = supported.length;
document.getElementById('sidebarOpen').addEventListener('click', () => document.getElementById('dashboardSidebar').classList.add('open')); document.getElementById('sidebarClose').addEventListener('click', () => document.getElementById('dashboardSidebar').classList.remove('open'));
document.getElementById('signOut').addEventListener('click', async () => { if (auth) await signOut(auth); localStorage.removeItem('inbestmen_user'); window.location.href = 'auth.html'; });
