(function () {
    'use strict';

    const loader = document.getElementById('spinner');
    const backToTop = document.querySelector('.back-to-top');
    const counters = document.querySelectorAll('[data-count]');

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

})();
