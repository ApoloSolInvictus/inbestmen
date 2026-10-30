(() => {
    const applyView = (view, updateHash = true) => {
        const panels = Array.from(document.querySelectorAll('.dashboard-view'));
        const validView = panels.some((panel) => panel.dataset.viewPanel === view) ? view : 'overview';
        panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === validView));
        document.querySelectorAll('.dashboard-nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === validView));
        const title = Array.from(document.querySelectorAll('.dashboard-nav-link')).find((link) => link.dataset.view === validView)?.querySelector('span');
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) pageTitle.textContent = title?.textContent || 'Home';
        if (updateHash && window.location.hash !== `#${validView}`) window.history.replaceState(null, '', `#${validView}`);
        document.getElementById('dashboardSidebar')?.classList.remove('open');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const bindNavigation = () => {
        document.querySelectorAll('.dashboard-nav-link').forEach((link) => link.addEventListener('click', (event) => {
            event.preventDefault();
            applyView(link.dataset.view);
        }));
        document.querySelectorAll('[data-open-view]').forEach((button) => button.addEventListener('click', (event) => {
            event.preventDefault();
            applyView(button.dataset.openView);
        }));
        document.getElementById('sidebarOpen')?.addEventListener('click', () => document.getElementById('dashboardSidebar')?.classList.add('open'));
        document.getElementById('sidebarClose')?.addEventListener('click', () => document.getElementById('dashboardSidebar')?.classList.remove('open'));
        window.addEventListener('hashchange', () => applyView(window.location.hash.slice(1), false));
        applyView(window.location.hash.slice(1) || 'overview', false);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindNavigation, { once: true });
    else bindNavigation();
})();
