(function () {
    'use strict';

    const loader = document.getElementById('spinner');
    const backToTop = document.querySelector('.back-to-top');
    const counters = document.querySelectorAll('[data-count]');
    const projectForm = document.getElementById('projectForm');
    const formStatus = document.getElementById('formStatus');
    const submitButton = document.getElementById('submitProjectBtn');

    window.addEventListener('load', function () {
        window.setTimeout(function () {
            loader?.classList.add('hidden');
        }, 250);
    });

    const revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(function (element) { revealObserver.observe(element); });

    const countObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            const element = entry.target;
            const target = Number(element.dataset.count);
            const decimal = String(target).includes('.') ? 1 : 0;
            const duration = 1000;
            const start = performance.now();
            function tick(now) {
                const progress = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                element.textContent = (target * eased).toFixed(decimal);
                if (progress < 1) window.requestAnimationFrame(tick);
            }
            window.requestAnimationFrame(tick);
            observer.unobserve(element);
        });
    }, { threshold: 0.8 });
    counters.forEach(function (counter) { countObserver.observe(counter); });

    window.addEventListener('scroll', function () {
        backToTop?.classList.toggle('show', window.scrollY > 500);
    }, { passive: true });

    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
        link.addEventListener('click', function () {
            const nav = document.getElementById('siteNav');
            if (nav?.classList.contains('show') && window.bootstrap) {
                window.bootstrap.Collapse.getOrCreateInstance(nav).hide();
            }
        });
    });

    projectForm?.addEventListener('submit', async function (event) {
        event.preventDefault();
        formStatus.className = 'form-status show info';
        formStatus.textContent = 'Preparing your structured project brief…';
        submitButton.disabled = true;

        const payload = Object.fromEntries(new FormData(projectForm).entries());
        try {
            const response = await fetch('/api/ai/screen-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'The screening service is not configured yet.');
            formStatus.className = 'form-status show success';
            formStatus.textContent = 'Your project brief is ready for the next review stage.';
            projectForm.reset();
        } catch (_error) {
            formStatus.className = 'form-status show info';
            formStatus.textContent = 'Preview mode: the intake form is ready. Connect OPENAI_API_KEY and ELEVENLABS_API_KEY in Vercel to activate AI screening.';
        } finally {
            submitButton.disabled = false;
        }
    });
})();
