(() => {
    'use strict';

    const layout = document.getElementById('publicProjectLayout');
    if (!layout) return;

    const feature = document.getElementById('publicProjectFeature');
    const side = document.getElementById('publicProjectSide');
    const loading = document.getElementById('publicProjectLoading');
    const empty = document.getElementById('publicProjectEmpty');
    const error = document.getElementById('publicProjectError');
    const modal = document.getElementById('publicProjectModal');
    let projects = [];
    let lastFocused = null;

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
    const number = (value) => Math.max(0, Number(value || 0));
    const formatNumber = (value) => number(value).toLocaleString('en-US');
    const modalValue = (value) => Array.isArray(value) ? (value.length ? value.join(', ') : 'Not captured') : String(value ?? '').trim() || 'Not captured';
    const projectDate = (project) => Date.parse(project.approvedAt || '') || 0;
    const progress = (project) => project.ibGoal > 0 ? Math.min(100, Math.round((project.ibRaised / project.ibGoal) * 100)) : 0;

    const compactNumber = (value) => {
        const amount = number(value);
        if (amount >= 1000000) return `${(amount / 1000000).toFixed(amount % 1000000 ? 1 : 0)}M`;
        if (amount >= 1000) return `${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)}k`;
        return formatNumber(amount);
    };

    const renderStats = (stats = {}) => {
        const values = {
            publicStatProjects: formatNumber(stats.approvedProjects),
            publicStatCountries: formatNumber(stats.connectedCountries),
            publicStatMembers: compactNumber(stats.communityMembers),
            publicStatCommitments: `$${compactNumber(stats.totalCommunityCommitmentsUsd)}`,
            publicHeroMembers: `${compactNumber(stats.communityMembers)} registered members`
        };
        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    };

    const proposalHref = (value) => {
        const url = String(value || '').trim();
        return /^https:\/\//i.test(url) || /^project-proposal\.html(?:\?|#|$)/i.test(url) ? url : '';
    };

    const projectArt = (project, icon) => `<div class="project-art solar-system-art ${escapeHtml(project.visual || '')}"><span class="art-label">${escapeHtml(project.category)}</span><div class="solar-system-scene" aria-hidden="true"><span class="solar-system-orbit orbit-one"></span><span class="solar-system-orbit orbit-two"></span><span class="solar-system-orbit orbit-three"></span><span class="solar-system-sun"></span></div><div class="art-symbol"><i class="bi ${escapeHtml(icon)}"></i></div></div>`;

    const card = (project, featured = false) => {
        const percent = progress(project);
        const icon = /^[a-z0-9-]+$/i.test(project.icon || '') ? project.icon : 'bi-stars';
        const compactClass = featured ? 'project-card-featured' : 'project-card-compact';
        const action = `<button class="public-project-button ${featured ? 'text-link' : 'btn btn-outline-dark'}" data-public-project="${escapeHtml(project.id)}" type="button">View project <i class="bi bi-arrow-up-right"></i></button>`;
        const raised = `<strong>${formatNumber(project.ibRaised)}</strong> iB Coins`;
        if (featured) {
            return `<article class="project-card public-project-card ${compactClass}">${projectArt(project, icon)}<div class="project-body"><div class="d-flex justify-content-between gap-3"><div><span class="project-status">${escapeHtml(project.status)}</span><h3>${escapeHtml(project.name)}</h3><p class="project-location"><i class="bi bi-geo-alt"></i> ${escapeHtml(project.location)}</p></div><span class="project-score">${percent}<small>progress</small></span></div><p class="project-description">${escapeHtml(project.summary || 'Approved project information will be shared with the community.')}</p><div class="progress-label"><span>${raised}</span><span>${percent}% of goal</span></div><div class="progress"><div class="progress-bar" role="progressbar" style="width:${percent}%" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"></div></div><div class="project-meta"><span><i class="bi bi-bullseye"></i> Goal ${formatNumber(project.ibGoal)} iB</span>${action}</div></div></article>`;
        }
        return `<article class="project-card public-project-card ${compactClass}">${projectArt(project, icon)}<div class="project-body"><span class="project-status">${escapeHtml(project.status)}</span><h3>${escapeHtml(project.name)}</h3><p class="project-location"><i class="bi bi-geo-alt"></i> ${escapeHtml(project.location)}</p><div class="compact-score"><strong>${formatNumber(project.ibRaised)}</strong><span>iB Coins<br>${percent}% of goal</span></div><div class="public-project-compact-action">${action}</div></div></article>`;
    };

    const render = () => {
        loading.hidden = true;
        error.hidden = true;
        if (!projects.length) {
            layout.hidden = true;
            empty.hidden = false;
            return;
        }
        empty.hidden = true;
        layout.hidden = false;
        feature.innerHTML = card(projects[0], true);
        side.innerHTML = projects.slice(1).map((project) => card(project)).join('');
        document.querySelectorAll('[data-public-project]').forEach((button) => button.addEventListener('click', () => open(projects.find((project) => project.id === button.dataset.publicProject), button)));
    };

    const load = async () => {
        try {
            const response = await fetch('/api/projects/public?limit=100', { headers: { Accept: 'application/json' } });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `Projects unavailable (${response.status}).`);
            renderStats(data.stats || {});
            projects = (Array.isArray(data.projects) ? data.projects : []).sort((first, second) => projectDate(second) - projectDate(first));
            render();
        } catch (loadError) {
            loading.hidden = true;
            layout.hidden = true;
            empty.hidden = true;
            error.hidden = false;
            console.warn(loadError);
        }
    };

    const open = (project, trigger) => {
        if (!project) return;
        lastFocused = trigger || document.activeElement;
        const details = project.publicBrief || {};
        const percent = progress(project);
        const proposal = document.getElementById('publicProjectProposal');
        document.getElementById('publicProjectCategory').textContent = project.category || 'Approved project';
        document.getElementById('publicProjectName').textContent = project.name || 'Project packet';
        document.getElementById('publicProjectLocation').innerHTML = `<i class="bi bi-geo-alt"></i> ${escapeHtml(project.location || 'Location not captured')}`;
        document.getElementById('publicProjectStatus').textContent = project.status || 'Approved for community support';
        document.getElementById('publicProjectSummary').textContent = details.summary || project.summary || 'No public summary has been published yet.';
        document.getElementById('publicProjectProgress').textContent = `${percent}%`;
        document.getElementById('publicProjectBar').style.width = `${percent}%`;
        document.getElementById('publicProjectRaised').textContent = `${formatNumber(project.ibRaised)} iB Coins`;
        document.getElementById('publicProjectGoal').textContent = `Goal ${formatNumber(project.ibGoal)} iB`;
        const fields = [['Founder', details.founderName], ['Problem', details.problem], ['Beneficiaries', details.beneficiaries], ['Proposed solution', details.proposedSolution], ['Current stage', details.stage], ['Team', details.team], ['Expected impact', details.impact], ['Timeline', details.timeline], ['Risks and considerations', details.risks]];
        document.getElementById('publicProjectDetails').innerHTML = fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><p>${escapeHtml(modalValue(value))}</p></div>`).join('');
        document.getElementById('publicProjectAiSummary').textContent = details.summary || 'No screening summary has been published yet.';
        const strengths = Array.isArray(details.strengths) ? details.strengths.filter(Boolean) : [];
        document.getElementById('publicProjectStrengths').innerHTML = strengths.length ? `<ul>${strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<span>No additional strengths were published in this packet.</span>';
        document.getElementById('publicProjectJson').textContent = JSON.stringify({ project: { id: project.id, name: project.name, category: project.category, location: project.location, status: project.status, ibRaised: project.ibRaised, ibGoal: project.ibGoal }, publicBrief: details }, null, 2);
        const url = proposalHref(project.proposalUrl);
        proposal.hidden = !url;
        if (url) proposal.href = url;
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('public-project-modal-open');
        document.getElementById('closePublicProject').focus();
    };

    const close = () => {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('public-project-modal-open');
        if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    };

    document.getElementById('closePublicProject').addEventListener('click', close);
    document.querySelector('[data-close-public-project]').addEventListener('click', close);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) close(); });
    load();
})();
