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

    const languageLabels = {
        'en-US': 'English',
        'es-ES': 'Spanish',
        'pt-BR': 'Portuguese',
        'fr-FR': 'French',
        'de-DE': 'German',
        'it-IT': 'Italian',
        'ja-JP': 'Japanese',
        'zh-CN': 'Mandarin Chinese'
    };

    const normalizePhone = (value) => String(value || '').replace(/[\s().-]/g, '');
    const maskPhone = (value) => value.length > 4 ? `${value.slice(0, 3)}•••${value.slice(-4)}` : value;

    projectForm?.addEventListener('submit', async function (event) {
        event.preventDefault();
        submitButton.disabled = true;
        const payload = Object.fromEntries(new FormData(projectForm).entries());
        payload.phoneNumber = normalizePhone(payload.phoneNumber);
        payload.callConsent = payload.callConsent === 'true';

        if (!/^\+[1-9]\d{7,14}$/.test(payload.phoneNumber)) {
            formStatus.className = 'form-status show error';
            formStatus.textContent = 'Please enter a valid phone number with country code, for example +1 555 123 4567.';
            submitButton.disabled = false;
            return;
        }

        formStatus.className = 'form-status show info';
        formStatus.textContent = 'Connecting your project to the voice intake agent…';

        try {
            const response = await fetch('/api/elevenlabs/outbound-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.success === false) {
                const error = new Error(result.error || 'The voice intake service could not start the call.');
                error.code = result.code;
                throw error;
            }

            const language = languageLabels[payload.preferredLanguage] || 'your selected language';
            formStatus.className = 'form-status show success';
            formStatus.textContent = `Your intake request is ready. An ElevenLabs agent will call ${maskPhone(payload.phoneNumber)} in ${language}.`;
            projectForm.reset();
        } catch (error) {
            if (error.code === 'ELEVENLABS_NOT_CONFIGURED') {
                formStatus.className = 'form-status show info';
                formStatus.textContent = 'Preview mode: your intake form is ready. Add the ElevenLabs API, agent and phone number IDs in Vercel to activate outbound calls.';
            } else {
                formStatus.className = 'form-status show error';
                formStatus.textContent = error.message || 'The voice intake service could not be reached. Please try again.';
            }
        } finally {
            submitButton.disabled = false;
        }
    });
})();
