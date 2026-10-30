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
let liveRefreshTimer = null;
let briefRecords = new Map();
let selectedBrief = null;

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

const apiFetch = async (path, options = {}) => {
    if (!currentUser) throw new Error('An approved Firebase management session is required.');
    const token = await currentUser.getIdToken();
    const response = await fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    return body;
};

const healthFields = {
    firebaseAuth: { label: 'Firebase auth', statusId: 'healthFirebase', barId: 'healthFirebaseBar' },
    elevenlabs: { label: 'ElevenLabs', statusId: 'healthElevenLabs', barId: 'healthElevenLabsBar' },
    elevenlabsWebhook: { label: 'ElevenLabs webhook', statusId: 'healthWebhook', barId: 'healthWebhookBar' },
    paypal: { label: 'PayPal', statusId: 'healthPayPal', barId: 'healthPayPalBar' },
    paypalWebhook: { label: 'PayPal payout webhook', statusId: 'healthPayPalWebhook', barId: 'healthPayPalWebhookBar' },
    weeklyScheduler: { label: 'Monday payout scheduler', statusId: 'healthScheduler', barId: 'healthSchedulerBar' },
    openai: { label: 'OpenAI', statusId: 'healthOpenAI', barId: 'healthOpenAIBar' },
    projectPublishing: { label: 'Project publishing', statusId: 'healthPublishing', barId: 'healthPublishingBar' }
};

const renderSystemHealth = (data) => {
    const checks = data.checks || {};
    Object.entries(healthFields).forEach(([key, field]) => {
        const check = checks[key] || { status: 'error', message: 'No result returned.' };
        const card = document.querySelector(`[data-health-check="${key}"]`);
        const statusElement = document.getElementById(field.statusId);
        const bar = document.getElementById(field.barId);
        const operational = check.status === 'operational';
        if (card) card.classList.toggle('health-error', !operational);
        if (statusElement) {
            statusElement.textContent = operational ? 'Operational' : 'Needs attention';
            statusElement.title = check.message || field.label;
        }
        if (bar) bar.style.width = operational ? '100%' : '12%';
    });
    const score = document.getElementById('healthScore');
    const healthy = Object.values(checks).filter((check) => check.status === 'operational').length;
    const total = Object.keys(healthFields).length;
    const allHealthy = data.ok && healthy === total;
    score.className = `health-score${allHealthy ? '' : ' error'}`;
    score.innerHTML = `<i class="bi bi-${allHealthy ? 'check-circle' : 'exclamation-triangle'}"></i> ${healthy}/${total} layers operational`;
    document.getElementById('healthLastChecked').textContent = `${data.checkedAt ? `Last checked ${formatDate(data.checkedAt)}. ` : ''}${Object.entries(checks).filter(([, check]) => check.status !== 'operational').map(([key, check]) => `${healthFields[key]?.label || key}: ${check.message || 'Needs attention'}`).join(' · ') || 'All configured production services responded successfully.'}`;
};

const loadSystemHealth = async () => {
    const button = document.getElementById('refreshSystemHealth');
    if (button) { button.disabled = true; button.innerHTML = '<i class="bi bi-arrow-repeat"></i> Checking…'; }
    try {
        renderSystemHealth(await apiFetch('/api/admin/system-health'));
    } catch (error) {
        const score = document.getElementById('healthScore');
        score.className = 'health-score error';
        score.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Check unavailable';
        document.getElementById('healthLastChecked').textContent = error.message || 'System health could not be loaded.';
    } finally {
        if (button) { button.disabled = false; button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Check now'; }
    }
};

let paymentLedger = null;
const formatIbUsd = (value) => `$${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

const renderPaymentLedger = (data) => {
    paymentLedger = data;
    const summary = data.summary || {};
    const projects = data.projects || [];
    const week = data.week || {};
    document.getElementById('ledgerGross').textContent = formatIbUsd(summary.grossContributionsIb);
    document.getElementById('ledgerGrossNote').textContent = `${Number(summary.grossContributionsIb || 0).toLocaleString('en-US')} iB recorded`;
    document.getElementById('ledgerPending').textContent = formatIbUsd(summary.pendingPayoutsIb);
    document.getElementById('ledgerPendingNote').textContent = summary.pendingPayoutsIb ? 'Submitted or processing' : 'Nothing in transit';
    document.getElementById('ledgerDue').textContent = formatIbUsd(summary.payoutsDueIb);
    document.getElementById('ledgerDueNote').textContent = week.label ? `Closed week ${week.label}` : 'Closed week';
    document.getElementById('ledgerPaid').textContent = formatIbUsd(summary.paidOutIb);
    document.getElementById('ledgerPaidNote').textContent = `${summary.projectsWithAccounts || 0} project account${summary.projectsWithAccounts === 1 ? '' : 's'} configured`;
    document.getElementById('paymentsDueMetric').textContent = formatIbUsd(summary.payoutsDueIb);
    document.getElementById('paymentsDueMetricNote').innerHTML = `<i class="bi bi-wallet2"></i> ${summary.pendingPayoutsIb ? 'Payouts in transit' : 'Closed-week obligations'}`;
    const completedProjects = projects.filter((project) => Number(project.ibGoal || 0) > 0 && Number(project.totalDonatedIb || 0) >= Number(project.ibGoal || 0));
    document.getElementById('completedProjectsMetric').textContent = String(completedProjects.length);
    document.getElementById('completedProjectsMetricNote').innerHTML = `<i class="bi bi-stars"></i> ${completedProjects.length ? 'Goals reached' : 'No completed projects yet'}`;
    document.getElementById('paymentLedgerState').innerHTML = `<i class="bi bi-check-circle"></i> ${projects.length} approved project${projects.length === 1 ? '' : 's'}`;
    document.getElementById('paymentLedgerStateMessage').textContent = week.label ? `Closed period: ${week.label}. Weekly amounts are capped by each approved project goal.` : 'Payment ledger loaded.';
    const body = document.getElementById('paymentLedgerBody');
    if (!projects.length) {
        body.innerHTML = '<tr><td colspan="5"><div class="live-empty-state large"><i class="bi bi-wallet2"></i><strong>No approved projects yet.</strong><span>Publish an approved project packet before assigning a payout account.</span></div></td></tr>';
        return;
    }
    body.innerHTML = projects.map((project) => {
        const goal = Number(project.ibGoal || 0);
        const progress = goal ? Math.min(100, Math.round((Number(project.totalDonatedIb || 0) / goal) * 100)) : 0;
        const status = String(project.payoutStatus || 'NOT_STARTED').toUpperCase();
        const accountNote = project.paypalAccountConfirmed ? 'Email confirmed' : 'Awaiting account confirmation';
        const sendLabel = project.weeklyDueIb ? `Send ${formatIbUsd(project.weeklyDueIb)}` : project.pendingPayoutIb ? 'In transit' : 'No payout due';
        return `<tr data-payment-project="${escapeHtml(project.id)}"><td><div class="table-project"><span class="table-project-mark cyan"><i class="bi bi-folder2-open"></i></span><div><strong>${escapeHtml(project.name || 'Unnamed project')}</strong><small>${escapeHtml(project.location || 'Location not captured')}</small><small>${formatIbUsd(project.totalDonatedIb)} raised · ${progress}% of ${formatIbUsd(goal)} goal</small></div></div></td><td><div class="payment-account-form"><input data-paypal-email type="email" value="${escapeHtml(project.paypalRecipientEmail || '')}" placeholder="project@paypal.com" aria-label="PayPal email for ${escapeHtml(project.name || 'project')}"><label><input data-paypal-confirm type="checkbox"${project.paypalAccountConfirmed ? ' checked' : ''}> Confirmed</label><label><input data-payouts-enabled type="checkbox"${project.payoutsEnabled ? ' checked' : ''}> Monday payouts enabled</label><button class="table-action approve" data-save-paypal type="button">Save account</button><small>${escapeHtml(accountNote)}</small></div></td><td><strong>${formatIbUsd(project.weeklyDueIb)}</strong><small>${Number(project.weeklyDonationsIb || 0).toLocaleString('en-US')} iB received · ${escapeHtml(week.label || 'closed week')}</small></td><td><strong>${formatIbUsd(project.totalPaidIb)} paid</strong><small>${formatIbUsd(project.goalRemainingIb)} available under goal · ${escapeHtml(status)}</small></td><td><div class="table-actions"><button class="table-action approve" data-send-payout type="button"${project.payoutReady ? '' : ' disabled'}>${sendLabel}</button>${project.pendingPayoutIb ? `<span class="table-muted">${formatIbUsd(project.pendingPayoutIb)} in transit</span>` : ''}</div></td></tr>`;
    }).join('');
};

const loadPaymentLedger = async () => {
    try {
        renderPaymentLedger(await apiFetch('/api/admin/payment-ledger'));
    } catch (error) {
        document.getElementById('paymentLedgerState').innerHTML = '<i class="bi bi-exclamation-triangle"></i> Ledger unavailable';
        document.getElementById('paymentLedgerStateMessage').textContent = error.message || 'The payment ledger could not be loaded.';
        document.getElementById('paymentLedgerStateMessage').style.color = '#a24e46';
    }
};

const saveProjectPayPalAccount = async (button) => {
    const row = button.closest('[data-payment-project]');
    const email = row.querySelector('[data-paypal-email]').value.trim();
    const confirmed = row.querySelector('[data-paypal-confirm]').checked;
    const enabled = row.querySelector('[data-payouts-enabled]').checked;
    button.disabled = true;
    try {
        await apiFetch('/api/admin/project-paypal', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: row.dataset.paymentProject, paypalRecipientEmail: email, paypalAccountConfirmed: confirmed, payoutsEnabled: enabled }) });
        showToast('Project PayPal account saved.');
        await loadPaymentLedger();
    } catch (error) {
        showToast(error.message || 'The project PayPal account could not be saved.');
    } finally { button.disabled = false; }
};

const sendProjectPayout = async (button) => {
    const row = button.closest('[data-payment-project]');
    const project = paymentLedger?.projects?.find((item) => item.id === row.dataset.paymentProject);
    if (!project || !window.confirm(`Send ${formatIbUsd(project.weeklyDueIb)} to ${project.paypalRecipientEmail} for ${project.name}? PayPal payouts may not be reversible.`)) return;
    button.disabled = true;
    try {
        await apiFetch('/api/admin/payment-ledger/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id }) });
        showToast('Weekly PayPal payout submitted. The webhook will reconcile the final status.');
        await loadPaymentLedger();
    } catch (error) {
        showToast(error.message || 'The PayPal payout could not be submitted.');
        button.disabled = false;
    }
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
    document.getElementById('activeAgentsMetric').textContent = data.ok ? '1' : '0';
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
            const summary = conversation.transcript_summary || conversation.analysis?.transcript_summary || conversation.call_summary_title || 'Analysis is still processing.';
            const statusClass = ['done', 'completed'].includes(conversation.status) ? 'ready' : conversation.status === 'failed' ? 'paused' : 'review';
            return `<tr><td><strong>${escapeHtml(conversation.conversation_id || '—')}</strong><small>${escapeHtml(formatDate(conversation.start_time_unix_secs))}</small></td><td><span class="status-pill ${statusClass}">${escapeHtml(conversation.status || 'unknown')}</span></td><td>${escapeHtml(conversation.conversation_initiation_source || '—')}</td><td class="summary-cell" title="${escapeHtml(summary)}">${escapeHtml(summary)}</td><td><button class="table-action approve" data-live-conversation="${escapeHtml(conversation.conversation_id || '')}" type="button">Open</button></td></tr>`;
        }).join(''));
    }
    conversationCursor = data.next_cursor || null;
    document.getElementById('liveConversationCount').textContent = `${conversations.length}${data.has_more ? '+' : ''} loaded`;
    document.getElementById('sessionsTodayMetric').textContent = String(conversations.length);
    document.getElementById('loadMoreConversations').hidden = !data.has_more;
};

const renderReviewQueue = (briefs) => {
    const reviewState = document.getElementById('liveReviewState');
    const reviewBody = document.getElementById('liveReviewBody');
    const activeBriefs = briefs.filter((brief) => ['pending_human_review', 'needs_more_information'].includes(brief.status));
    reviewState.textContent = activeBriefs.length ? `${activeBriefs.length} live project brief${activeBriefs.length === 1 ? '' : 's'} awaiting human review.` : 'No project briefs are ready for review.';
    reviewBody.innerHTML = activeBriefs.map((brief) => {
        const project = brief.project || {};
        const founder = brief.founder || {};
        const review = brief.aiReview || {};
        const id = String(brief.id || brief.conversationId || '');
        const goal = typeof project.budgetUsd === 'number' && project.budgetUsd > 0 ? `$${project.budgetUsd.toLocaleString()}` : 'Not captured';
        const statusClass = brief.status === 'pending_human_review' ? 'review' : 'priority';
        const publishAction = brief.status === 'pending_human_review' ? `<button class="table-action approve" data-approve-brief-id="${escapeHtml(id)}" type="button">Approve to projects</button>` : '<span class="table-muted">Needs more information</span>';
        return `<tr><td><div class="table-project"><span class="table-project-mark cyan"><i class="bi bi-file-earmark-text"></i></span><div><strong>${escapeHtml(project.name || 'Unnamed project')}</strong><small>${escapeHtml(project.category || 'Category not captured')}</small></div></div></td><td>${escapeHtml(founder.name || 'Founder not captured')}<br><small>${escapeHtml(project.location || 'Location not captured')}</small></td><td><span class="status-pill ${statusClass}">${escapeHtml(brief.status || 'needs_more_information')}</span><small>${escapeHtml(review.qualityScore ?? '—')}/100 score</small></td><td><strong>${escapeHtml(goal)}</strong></td><td><div class="table-actions"><button class="table-link" data-open-brief-id="${escapeHtml(id)}" type="button">Open packet</button>${publishAction}<button class="table-action remove" data-delete-brief-id="${escapeHtml(id)}" type="button" aria-label="Remove ${escapeHtml(project.name || 'project')} from the dashboard">Remove</button></div></td></tr>`;
    }).join('');
};

const renderOverview = (briefs) => {
    const queue = document.getElementById('liveOverviewQueue');
    const activity = document.getElementById('liveOverviewActivity');
    const reviewBriefs = briefs.filter((brief) => ['pending_human_review', 'needs_more_information'].includes(brief.status));
    queue.innerHTML = reviewBriefs.length ? reviewBriefs.slice(0, 4).map((brief, index) => `<div class="priority-item"><span class="priority-number">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(brief.project?.name || 'Unnamed project')}</strong><small>${escapeHtml(brief.project?.category || 'Category not captured')} · ${escapeHtml(brief.project?.location || 'Location not captured')}</small></div><span class="status-pill ${brief.status === 'pending_human_review' ? 'review' : 'priority'}">${escapeHtml(brief.status || 'Review')}</span></div>`).join('') : '<div class="live-empty-state">No real projects have been received yet.</div>';
    activity.innerHTML = briefs.length ? briefs.slice(0, 4).map((brief) => `<div><span class="activity-icon cyan"><i class="bi bi-mic"></i></span><p><strong>${escapeHtml(brief.project?.name || 'Unnamed project')}</strong> intake captured<small>${escapeHtml(brief.status || 'Review pending')} · ${escapeHtml(formatDate(brief.capturedAt))}</small></p></div>`).join('') : '<div class="live-empty-state">No conversations have been synchronized yet.</div>';
};

const renderBriefs = (data) => {
    const briefs = data.briefs || [];
    briefRecords = new Map(briefs.map((brief) => [String(brief.id || brief.conversationId || ''), brief]));
    document.getElementById('liveBriefCount').textContent = `${briefs.length} saved`;
    const pendingCount = briefs.filter((brief) => ['pending_human_review', 'needs_more_information'].includes(brief.status)).length;
    document.getElementById('pendingProjectsMetric').textContent = String(pendingCount);
    document.getElementById('reviewNavCount').textContent = String(pendingCount);
    document.getElementById('briefsReadyMetric').textContent = String(briefs.length);
    document.getElementById('humanHandoffsMetric').textContent = String(briefs.filter((brief) => brief.status === 'pending_human_review').length);
    renderReviewQueue(briefs);
    renderOverview(briefs);
    const state = document.getElementById('liveBriefState');
    const list = document.getElementById('liveBriefList');
    if (!briefs.length) {
        state.textContent = 'No stored project briefs yet. Configure the signed post-call webhook to capture the first one.';
        list.innerHTML = '';
        return;
    }
    state.textContent = 'Structured briefs captured by ElevenLabs, screened by OpenAI and stored in Firestore.';
    list.innerHTML = briefs.map((brief) => {
        const briefId = String(brief.id || brief.conversationId || '');
        return `<div class="live-brief-item"><strong>${escapeHtml(brief.project?.name || 'Unnamed project')}</strong><small>${escapeHtml(brief.founder?.name || 'Founder not captured')} · ${escapeHtml(brief.project?.location || 'Location not captured')}</small><span>${escapeHtml(brief.status || 'pending_human_review')} · ${escapeHtml(formatDate(brief.capturedAt))}</span><em>${escapeHtml(brief.aiReview?.summary || 'OpenAI screening summary not available.')}</em><div class="live-brief-actions"><button class="admin-secondary-button live-brief-open" data-open-brief-id="${escapeHtml(briefId)}" type="button"><i class="bi bi-file-earmark-text"></i> Open board packet</button><button class="admin-secondary-button admin-danger-button live-brief-remove" data-delete-brief-id="${escapeHtml(briefId)}" type="button"><i class="bi bi-trash3"></i> Remove</button></div></div>`;
    }).join('');
};

const renderList = (items, emptyLabel = 'None recorded.') => {
    const values = Array.isArray(items) ? items.filter(Boolean) : items ? [items] : [];
    return values.length ? `<ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : `<p>${escapeHtml(emptyLabel)}</p>`;
};

const renderFacts = (brief) => {
    const founder = brief.founder || {};
    const project = brief.project || {};
    const fields = [
        ['Founder', founder.name || 'Founder not captured'],
        ['Email', founder.email || 'Email not captured'],
        ['Telegram username', founder.telegramUsername || 'Not captured'],
        ['Telegram chat ID', founder.telegramChatId || 'Not captured'],
        ['Project name', project.name || 'Unnamed project'],
        ['Location', project.location || 'Location not captured'],
        ['Category', project.category || 'Category not captured'],
        ['Funding goal', typeof project.budgetUsd === 'number' ? `$${project.budgetUsd.toLocaleString()} USD` : 'Not captured'],
        ['Stage', project.stage || 'Not captured'],
        ['Timeline', project.timeline || 'Not captured'],
        ['Beneficiaries', project.beneficiaries || 'Not captured'],
        ['Team', project.team || 'Not captured'],
        ['Problem', project.problem || 'Not captured'],
        ['Proposed solution', project.proposedSolution || 'Not captured'],
        ['Expected impact', project.impact || 'Not captured'],
        ['Founder-provided risks', project.risks || 'Not captured']
    ];
    return fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
};

const renderTranscript = (transcript) => {
    const turns = Array.isArray(transcript) ? transcript : [];
    if (!turns.length) return '<p class="brief-document-muted">No transcript was captured in this packet.</p>';
    return turns.map((turn) => {
        const speaker = turn.role || turn.speaker || turn.source || 'Participant';
        const message = turn.message || turn.text || turn.content || turn.transcript || '';
        return `<div><span>${escapeHtml(speaker)}</span><p>${escapeHtml(message || '—')}</p></div>`;
    }).join('');
};

const openBriefDocument = (briefId) => {
    const brief = briefRecords.get(String(briefId));
    if (!brief) return showToast('That project brief is no longer in the current list. Refresh the live data.');
    selectedBrief = brief;
    const project = brief.project || {};
    const review = brief.aiReview || {};
    document.getElementById('briefDocumentTitle').textContent = project.name || 'Project brief';
    document.getElementById('briefDocumentMeta').innerHTML = `<span><strong>Status</strong>${escapeHtml(brief.status || '—')}</span><span><strong>Quality score</strong>${escapeHtml(review.qualityScore ?? '—')}/100</span><span><strong>Captured</strong>${escapeHtml(formatDate(brief.capturedAt))}</span><span><strong>Conversation</strong>${escapeHtml(brief.conversationId || '—')}</span>`;
    document.getElementById('briefDocumentSummary').innerHTML = `<div><h4>Board summary</h4><p>${escapeHtml(review.summary || brief.review?.summary || 'No screening summary was returned.')}</p></div><div><h4>Strengths</h4>${renderList(review.strengths)}</div><div><h4>Information still needed</h4>${renderList(review.missingInformation)}</div><div><h4>Risk flags</h4>${renderList(review.riskFlags)}</div>`;
    document.getElementById('briefDocumentFacts').innerHTML = renderFacts(brief);
    document.getElementById('briefDocumentTranscript').innerHTML = renderTranscript(brief.transcript);
    document.getElementById('briefDocumentContent').textContent = JSON.stringify(brief, null, 2);
    const approveButton = document.getElementById('approveBriefDocument');
    approveButton.hidden = brief.status !== 'pending_human_review';
    approveButton.disabled = false;
    const panel = document.getElementById('briefDocument');
    setView('reviews');
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const approveStoredBrief = async (briefId, trigger = null) => {
    const brief = briefRecords.get(String(briefId));
    if (!brief) return showToast('That project brief is no longer in the current list. Refresh the live data.');
    if (brief.status !== 'pending_human_review') return showToast('This project needs more information before it can be published.');
    const projectName = brief.project?.name || 'this project';
    if (!window.confirm(`Approve “${projectName}” for the public inBest Projects list?`)) return;
    if (trigger) { trigger.disabled = true; trigger.textContent = 'Publishing…'; }
    try {
        const data = await apiFetch('/api/projects/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: brief.id || brief.conversationId }) });
        if (selectedBrief && String(selectedBrief.id || selectedBrief.conversationId) === String(briefId)) {
            selectedBrief = data.brief || selectedBrief;
            document.getElementById('briefDocument').hidden = true;
        }
        showToast(`${projectName} was approved and published to inBest Projects.`);
        await loadLiveOperations();
    } catch (error) {
        showToast(error.message || 'The project could not be published.');
        if (trigger) { trigger.disabled = false; trigger.textContent = 'Approve to projects'; }
    }
};

const deleteStoredBrief = async (briefId, trigger = null) => {
    const brief = briefRecords.get(String(briefId));
    if (!brief) return showToast('That project brief is no longer in the current list. Refresh the live data.');
    const projectName = brief.project?.name || 'this project brief';
    if (!window.confirm(`Remove “${projectName}” from the Admin dashboard? The original ElevenLabs conversation will remain in ElevenLabs.`)) return;
    if (trigger) trigger.disabled = true;
    try {
        const data = await apiFetch('/api/projects/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: brief.id || brief.conversationId, confirmation: 'DELETE' }) });
        if (selectedBrief && String(selectedBrief.id || selectedBrief.conversationId) === String(briefId)) {
            selectedBrief = null;
            document.getElementById('briefDocument').hidden = true;
        }
        showToast(data.deleted === false ? 'The brief was already removed from the dashboard.' : `${projectName} was removed from the dashboard.`);
        await loadLiveOperations();
    } catch (error) {
        showToast(error.message || 'The project brief could not be removed.');
        if (trigger) trigger.disabled = false;
    }
};

const syncRecentCalls = async () => {
    const button = document.getElementById('syncRecentCalls');
    button.disabled = true;
    button.innerHTML = '<i class="bi bi-arrow-repeat"></i> Syncing…';
    try {
        const data = await apiFetch('/api/projects/sync?limit=10', { method: 'POST' });
        const synced = (data.results || []).filter((item) => !['already_stored', 'skipped'].includes(item.status)).length;
        const failed = (data.results || []).filter((item) => item.status === 'failed').length;
        showToast(`${synced} conversation${synced === 1 ? '' : 's'} synchronized${failed ? ` · ${failed} failed` : ''}.`);
        await loadLiveOperations();
    } catch (error) {
        showToast(error.message || 'Recent calls could not be synchronized.');
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-cloud-arrow-down"></i> Sync calls';
    }
};

const clearStoredBriefs = async () => {
    const confirmation = window.prompt('This permanently deletes all stored project briefs from Firestore. Type RESET to continue.');
    if (confirmation !== 'RESET') return;
    const button = document.getElementById('clearStoredBriefs');
    button.disabled = true;
    button.innerHTML = '<i class="bi bi-arrow-repeat"></i> Clearing…';
    try {
        const data = await apiFetch('/api/projects/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation }) });
        selectedBrief = null;
        document.getElementById('briefDocument').hidden = true;
        showToast(`${data.deleted || 0} stored project brief${data.deleted === 1 ? '' : 's'} deleted. New intake baseline set.`);
        await loadLiveOperations();
    } catch (error) {
        showToast(error.message || 'Stored project briefs could not be deleted.');
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-trash3"></i> Clear data';
    }
};

const downloadBriefJson = () => {
    if (!selectedBrief) return;
    const filename = `${String(selectedBrief.project?.name || 'inbestmen-project-brief').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'inbestmen-project-brief'}.json`;
    const blob = new Blob([JSON.stringify(selectedBrief, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
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
    const [agentResult, conversationResult, briefResult, healthResult, paymentResult] = await Promise.allSettled([
        apiFetch('/api/elevenlabs/status'),
        loadConversations(false),
        apiFetch('/api/projects/briefs?limit=10'),
        loadSystemHealth(),
        loadPaymentLedger()
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
    if (liveRefreshTimer) window.clearInterval(liveRefreshTimer);
    if (!preview) {
        loadLiveOperations();
        liveRefreshTimer = window.setInterval(loadLiveOperations, 60000);
    }
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
document.getElementById('adminSignOut').addEventListener('click', async () => { if (liveRefreshTimer) window.clearInterval(liveRefreshTimer); if (auth) await signOut(auth); currentUser = null; app.hidden = true; gate.hidden = false; showStatus('You have been signed out of the management console.'); });
document.getElementById('refreshLiveData').addEventListener('click', loadLiveOperations);
document.getElementById('refreshSystemHealth').addEventListener('click', loadSystemHealth);
document.getElementById('refreshPaymentLedger').addEventListener('click', loadPaymentLedger);
document.getElementById('syncRecentCalls').addEventListener('click', syncRecentCalls);
document.getElementById('clearStoredBriefs').addEventListener('click', clearStoredBriefs);
document.getElementById('loadMoreConversations').addEventListener('click', () => loadConversations(true));
document.getElementById('closeConversationDetail').addEventListener('click', () => { document.getElementById('conversationDetail').hidden = true; });
document.getElementById('closeBriefDocument').addEventListener('click', () => { document.getElementById('briefDocument').hidden = true; });
document.getElementById('approveBriefDocument').addEventListener('click', (event) => { if (selectedBrief) approveStoredBrief(selectedBrief.id || selectedBrief.conversationId, event.currentTarget); });
document.getElementById('downloadBriefJson').addEventListener('click', downloadBriefJson);
document.getElementById('printBriefDocument').addEventListener('click', () => window.print());
document.getElementById('deleteBriefDocument').addEventListener('click', (event) => { if (selectedBrief) deleteStoredBrief(selectedBrief.id || selectedBrief.conversationId, event.currentTarget); });

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
    const savePayPalButton = event.target.closest('[data-save-paypal]');
    if (savePayPalButton) {
        event.preventDefault();
        saveProjectPayPalAccount(savePayPalButton);
        return;
    }

    const sendPayoutButton = event.target.closest('[data-send-payout]');
    if (sendPayoutButton) {
        event.preventDefault();
        sendProjectPayout(sendPayoutButton);
        return;
    }

    const liveConversationButton = event.target.closest('[data-live-conversation]');
    if (liveConversationButton) openConversation(liveConversationButton.dataset.liveConversation);

    const briefButton = event.target.closest('[data-open-brief-id]');
    if (briefButton) {
        event.preventDefault();
        openBriefDocument(briefButton.dataset.openBriefId);
        return;
    }

    const approveButton = event.target.closest('[data-approve-brief-id]');
    if (approveButton) {
        event.preventDefault();
        approveStoredBrief(approveButton.dataset.approveBriefId, approveButton);
        return;
    }

    const deleteButton = event.target.closest('[data-delete-brief-id]');
    if (deleteButton) {
        event.preventDefault();
        deleteStoredBrief(deleteButton.dataset.deleteBriefId, deleteButton);
        return;
    }

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
