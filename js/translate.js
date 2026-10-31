(function () {
    'use strict';

    const languages = [
        ['Afrikaans', 'af'], ['Albanian', 'sq'], ['Amharic', 'am'], ['Arabic', 'ar'], ['Armenian', 'hy'],
        ['Azerbaijani', 'az'], ['Basque', 'eu'], ['Belarusian', 'be'], ['Bengali', 'bn'], ['Bosnian', 'bs'],
        ['Bulgarian', 'bg'], ['Catalan', 'ca'], ['Cebuano', 'ceb'], ['Chinese (Simplified)', 'zh-CN'],
        ['Chinese (Traditional)', 'zh-TW'], ['Corsican', 'co'], ['Croatian', 'hr'], ['Czech', 'cs'],
        ['Danish', 'da'], ['Dutch', 'nl'], ['English', 'en'], ['Esperanto', 'eo'], ['Estonian', 'et'],
        ['Filipino', 'tl'], ['Finnish', 'fi'], ['French', 'fr'], ['Frisian', 'fy'], ['Galician', 'gl'],
        ['Georgian', 'ka'], ['German', 'de'], ['Greek', 'el'], ['Gujarati', 'gu'], ['Haitian Creole', 'ht'],
        ['Hausa', 'ha'], ['Hawaiian', 'haw'], ['Hebrew', 'iw'], ['Hindi', 'hi'], ['Hmong', 'hmn'],
        ['Hungarian', 'hu'], ['Icelandic', 'is'], ['Igbo', 'ig'], ['Indonesian', 'id'], ['Irish', 'ga'],
        ['Italian', 'it'], ['Japanese', 'ja'], ['Javanese', 'jw'], ['Kannada', 'kn'], ['Kazakh', 'kk'],
        ['Khmer', 'km'], ['Korean', 'ko'], ['Kurdish', 'ku'], ['Kyrgyz', 'ky'], ['Lao', 'lo'], ['Latin', 'la'],
        ['Latvian', 'lv'], ['Lithuanian', 'lt'], ['Luxembourgish', 'lb'], ['Macedonian', 'mk'],
        ['Malagasy', 'mg'], ['Malay', 'ms'], ['Malayalam', 'ml'], ['Maltese', 'mt'], ['Maori', 'mi'],
        ['Marathi', 'mr'], ['Mongolian', 'mn'], ['Myanmar (Burmese)', 'my'], ['Nepali', 'ne'], ['Norwegian', 'no'],
        ['Nyanja (Chichewa)', 'ny'], ['Pashto', 'ps'], ['Persian', 'fa'], ['Polish', 'pl'], ['Portuguese', 'pt'],
        ['Punjabi', 'pa'], ['Romanian', 'ro'], ['Russian', 'ru'], ['Samoan', 'sm'], ['Scots Gaelic', 'gd'],
        ['Serbian', 'sr'], ['Sesotho', 'st'], ['Shona', 'sn'], ['Sindhi', 'sd'], ['Sinhala', 'si'],
        ['Slovak', 'sk'], ['Slovenian', 'sl'], ['Somali', 'so'], ['Spanish', 'es'], ['Sundanese', 'su'],
        ['Swahili', 'sw'], ['Swedish', 'sv'], ['Tajik', 'tg'], ['Tamil', 'ta'], ['Telugu', 'te'], ['Thai', 'th'],
        ['Turkish', 'tr'], ['Turkmen', 'tk'], ['Ukrainian', 'uk'], ['Urdu', 'ur'], ['Uyghur', 'ug'],
        ['Uzbek', 'uz'], ['Vietnamese', 'vi'], ['Welsh', 'cy'], ['Xhosa', 'xh'], ['Yiddish', 'yi'],
        ['Yoruba', 'yo'], ['Zulu', 'zu']
    ];

    let googleReady = false;
    let googleInitializing = false;
    let pendingLanguage = null;
    let googleSelectRetryTimer = null;
    let googleScriptAttempts = 0;
    let landingRefreshTimer = null;
    let lastLandingRefresh = 0;
    let landingTranslationToken = 0;
    let landingTranslationTimer = null;
    const landingTextOriginals = new WeakMap();
    const landingAttributeOriginals = new WeakMap();
    const trackedLandingTextNodes = new Set();
    const trackedLandingAttributes = new Set();
    const landingTranslationCache = new Map();

    const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const getPathLanguage = () => {
        const segment = window.location.pathname.split('/').filter(Boolean)[0] || '';
        return languages.find(([, code]) => code.toLowerCase() === segment.toLowerCase())?.[1] || '';
    };
    const getSavedLanguage = () => getPathLanguage() || window.localStorage.getItem('inbestmen_language') || 'en';

    const saturnIcon = '<span class="saturn-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-24 12 12)"></ellipse><circle cx="12" cy="12" r="4.2"></circle></svg></span>';

    function getHost() {
        const candidates = [
            ['.site-header .nav-actions', 'prepend'],
            ['.dashboard-header .header-actions', 'prepend'],
            ['.admin-header-actions', 'prepend'],
            ['.project-profile-nav', 'beforeProjectAction'],
            ['.proposal-header nav', 'append'],
            ['.legal-header', 'beforeLast'],
            ['.auth-card', 'authCard'],
            ['.navbar-collapse .d-flex', 'prepend']
        ];
        for (const [selector, mode] of candidates) {
            const element = document.querySelector(selector);
            if (element) return { element, mode };
        }
        return { element: document.body, mode: 'append' };
    }

    function buildSwitcher() {
        const switcher = document.createElement('div');
        switcher.className = 'translate-switcher notranslate';
        switcher.setAttribute('translate', 'no');
        switcher.dataset.translateSwitcher = '';
        switcher.innerHTML = `<button class="translate-toggle" type="button" aria-label="Translate page" aria-expanded="false" aria-haspopup="true">${saturnIcon}<span class="translate-label">Translate</span></button><div class="translate-menu" role="dialog" aria-label="Choose a language" hidden><div class="translate-menu-header"><strong>Choose a language</strong><button class="translate-menu-close" type="button" aria-label="Close language menu">×</button></div><label class="translate-search-label" for="inbestmenLanguageSearch">Search language</label><input id="inbestmenLanguageSearch" class="translate-search" type="search" autocomplete="off" placeholder="Search languages"><div class="translate-language-list"></div><button class="translate-reset" type="button" data-translate-reset>English (original)</button></div>`;
        return switcher;
    }

    function placeSwitcher(switcher, host, mode) {
        if (mode === 'prepend') host.prepend(switcher);
        else if (mode === 'append') host.append(switcher);
        else if (mode === 'beforeProjectAction') {
            const action = host.querySelector('.project-nav-cta, .project-menu-button');
            action ? host.insertBefore(switcher, action) : host.append(switcher);
        } else if (mode === 'beforeLast') {
            const last = host.querySelector('.text-button');
            last ? host.insertBefore(switcher, last) : host.append(switcher);
        } else if (mode === 'authCard') {
            switcher.classList.add('translate-standalone');
            host.append(switcher);
        }
        if (host === document.body) switcher.classList.add('translate-floating');
    }

    function renderLanguages(list, query) {
        const term = normalize(query);
        const filtered = languages.filter(([name]) => normalize(name).includes(term));
        list.innerHTML = filtered.length ? filtered.map(([name, code]) => `<button class="translate-language-option${code === getSavedLanguage() ? ' active' : ''}" type="button" data-language="${code}"><span>${name}</span><small>${code}</small></button>`).join('') : '<span class="translate-language-empty">No language found.</span>';
    }

    function getGoogleSelect() {
        return document.querySelector('.goog-te-combo');
    }

    function getGoogleLanguageCookie() {
        const cookie = document.cookie.split('; ').find((part) => part.startsWith('googtrans='));
        return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : '';
    }

    function setGoogleLanguageCookie(code) {
        const hostname = window.location.hostname;
        const cookieAttributes = 'path=/;SameSite=Lax';
        const parentDomain = hostname.split('.').length > 2 ? `;domain=.${hostname.split('.').slice(-2).join('.')}` : '';
        const domains = hostname && hostname.includes('.') ? ['', `;domain=.${hostname}`, parentDomain] : [''];
        const value = code === 'en' ? '' : `/en/${code}`;

        domains.forEach((domain) => {
            document.cookie = value
                ? `googtrans=${encodeURIComponent(value)};${cookieAttributes}${domain}`
                : `googtrans=;expires=Thu, 01 Jan 1970 00:00:00 GMT;${cookieAttributes}${domain}`;
        });
    }

    function primeLanguageFromUrl() {
        const language = getPathLanguage();
        if (!language) return;
        window.localStorage.setItem('inbestmen_language', language);
        setGoogleLanguageCookie(language);
        document.documentElement.dataset.inbestmenLanguage = language;
        // Keep the source document language in English until Google finishes
        // translating it. Setting lang to the target language here makes the
        // widget believe the page is already translated.
        document.documentElement.lang = 'en';
    }

    function fireGoogleChange(select) {
        select.dispatchEvent(new Event('change', { bubbles: true }));
        window.setTimeout(() => select.dispatchEvent(new Event('change', { bubbles: true })), 80);
    }

    function scheduleTranslationRefresh(code, shouldRefresh, reload, hadCorrectCookie) {
        if (!shouldRefresh || (!reload && hadCorrectCookie)) return;
        const key = `inbestmen_translate_refresh_${code}`;
        if (window.sessionStorage.getItem(key) === '1') return;
        window.sessionStorage.setItem(key, '1');
        window.setTimeout(() => window.location.reload(), 350);
    }

    function refreshLanguageOptions() {
        document.querySelectorAll('[data-translate-switcher]').forEach((switcher) => {
            const list = switcher.querySelector('.translate-language-list');
            if (list) renderLanguages(list, switcher.querySelector('.translate-search')?.value || '');
        });
    }

    function isLandingPath() {
        const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
        const pathLanguage = getPathLanguage();
        return pathname === '/' || pathname === '/index.html' || pathname === `/${pathLanguage}`;
    }

    function syncLanguageUrl(code) {
        if (!isLandingPath()) return;
        const pathname = `/${code}`;
        const nextUrl = `${pathname}${window.location.search}${window.location.hash}`;
        if (window.location.pathname !== pathname) window.history.replaceState(null, '', nextUrl);
    }

    function waitForGoogleSelect() {
        if (googleSelectRetryTimer) return;
        let attempts = 0;
        const check = () => {
            const select = getGoogleSelect();
            if (select && select.options.length > 1) {
                googleSelectRetryTimer = null;
                setGoogleLanguage(pendingLanguage || getSavedLanguage(), { reload: false });
                return;
            }
            if (attempts++ >= 60) {
                googleSelectRetryTimer = null;
                return;
            }
            googleSelectRetryTimer = window.setTimeout(() => {
                googleSelectRetryTimer = null;
                check();
            }, 250);
        };
        check();
    }

    function setGoogleLanguage(code, { reload = true, syncUrl = false } = {}) {
        pendingLanguage = code;
        const previousLanguage = getSavedLanguage();
        if (syncUrl) syncLanguageUrl(code);
        const hadCorrectCookie = code === 'en' ? !getGoogleLanguageCookie() : getGoogleLanguageCookie() === `/en/${code}`;
        const shouldRefresh = previousLanguage !== code || !hadCorrectCookie;
        window.localStorage.setItem('inbestmen_language', code);
        setGoogleLanguageCookie(code);
        document.documentElement.lang = 'en';
        document.documentElement.dataset.inbestmenLanguage = code;
        window.dispatchEvent(new CustomEvent('inbestmen:language-changed', { detail: { language: code } }));
        if (hadCorrectCookie) window.sessionStorage.removeItem(`inbestmen_translate_refresh_${code}`);

        const select = getGoogleSelect();
        if (!select || select.options.length < 2) {
            waitForGoogleSelect();
            scheduleTranslationRefresh(code, shouldRefresh, reload, hadCorrectCookie);
            return;
        }

        const targetValue = code === 'en' ? '' : code;
        const option = Array.from(select.options).find((item) => item.value === targetValue);
        if (code !== 'en' && !option) {
            scheduleTranslationRefresh(code, shouldRefresh, reload, hadCorrectCookie);
            return;
        }

        pendingLanguage = null;
        select.value = targetValue;
        fireGoogleChange(select);
        refreshLanguageOptions();
        scheduleTranslationRefresh(code, shouldRefresh, reload, hadCorrectCookie);
    }

    function applyPendingLanguage() {
        const language = pendingLanguage || getSavedLanguage();
        if (!language) return;
        syncLanguageUrl(language);
        if (language === 'en') {
            if (getGoogleLanguageCookie()) setGoogleLanguage('en', { reload: false });
            return;
        }
        setGoogleLanguage(language, { reload: false });
    }

    function isLandingTranslationExcluded(element) {
        return !element || Boolean(element.closest('[data-translate-switcher], #google_translate_element, script, style, noscript, template, code, pre, .notranslate, [translate="no"], .goog-te-gadget, .skiptranslate'));
    }

    function getLandingTextNodes() {
        const root = document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (isLandingTranslationExcluded(node.parentElement)) continue;
            const value = node.nodeValue || '';
            if (value.trim().length < 2 || !/[A-Za-z]/.test(value)) continue;
            if (!landingTextOriginals.has(node)) {
                landingTextOriginals.set(node, value);
                trackedLandingTextNodes.add(node);
            }
            nodes.push(node);
        }
        return nodes;
    }

    function getLandingAttributes() {
        const root = document.body;
        const elements = root.querySelectorAll('img[alt], [title], [aria-label], input[placeholder], textarea[placeholder]');
        const entries = [];
        elements.forEach((element) => {
            if (isLandingTranslationExcluded(element)) return;
            ['alt', 'title', 'aria-label', 'placeholder'].forEach((name) => {
                if (!element.hasAttribute(name)) return;
                const value = element.getAttribute(name) || '';
                if (value.trim().length < 2 || !/[A-Za-z]/.test(value)) return;
                let originals = landingAttributeOriginals.get(element);
                if (!originals) {
                    originals = new Map();
                    landingAttributeOriginals.set(element, originals);
                }
                if (!originals.has(name)) {
                    originals.set(name, value);
                    trackedLandingAttributes.add({ element, name });
                }
                entries.push({ element, name, value: originals.get(name) });
            });
        });
        return entries;
    }

    function restoreLandingOriginal() {
        trackedLandingTextNodes.forEach((node) => {
            if (node.isConnected && landingTextOriginals.has(node)) node.nodeValue = landingTextOriginals.get(node);
        });
        trackedLandingAttributes.forEach(({ element, name }) => {
            const originals = landingAttributeOriginals.get(element);
            if (element.isConnected && originals?.has(name)) element.setAttribute(name, originals.get(name));
        });
        document.documentElement.lang = 'en';
    }

    function parseGoogleTranslation(payload) {
        if (!Array.isArray(payload?.[0])) return '';
        return payload[0].map((part) => Array.isArray(part) ? String(part[0] || '') : '').join('');
    }

    async function translateLandingBatch(values, language, batchNumber) {
        const marker = `@@INBESTMEN_SPLIT_${batchNumber}@@`;
        const source = values.join(` ${marker} `);
        const cacheKey = `${language}|${source}`;
        if (landingTranslationCache.has(cacheKey)) return landingTranslationCache.get(cacheKey);
        const endpoints = ['https://translate.googleapis.com', 'https://translate.google.com'];
        let payload = null;
        for (const endpoint of endpoints) {
            try {
                const url = `${endpoint}/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(language)}&dt=t&q=${encodeURIComponent(source)}`;
                const response = await fetch(url, { headers: { Accept: 'application/json' } });
                if (!response.ok) continue;
                const body = await response.text();
                payload = JSON.parse(body);
                break;
            } catch (error) {
                if (endpoint === endpoints[endpoints.length - 1]) throw error;
            }
        }
        const translated = parseGoogleTranslation(payload);
        const parts = translated.split(marker).map((value) => value.trim());
        const result = parts.length === values.length ? parts : null;
        landingTranslationCache.set(cacheKey, result);
        return result;
    }

    async function translateLandingEntries(entries, language, token) {
        const batches = [];
        let batch = [];
        let length = 0;
        entries.forEach((entry) => {
            const value = entry.value;
            if (batch.length && (batch.length >= 8 || length + value.length > 2200)) {
                batches.push(batch);
                batch = [];
                length = 0;
            }
            batch.push(entry);
            length += value.length;
        });
        if (batch.length) batches.push(batch);

        for (let index = 0; index < batches.length; index += 1) {
            if (token !== landingTranslationToken) return;
            const current = batches[index];
            let translated = await translateLandingBatch(current.map((entry) => entry.value), language, index);
            if (!translated) {
                translated = [];
                for (const entry of current) {
                    const single = await translateLandingBatch([entry.value], language, `${index}-${translated.length}`);
                    translated.push(single?.[0] || entry.value);
                }
            }
            current.forEach((entry, entryIndex) => {
                if (token !== landingTranslationToken) return;
                const value = translated?.[entryIndex];
                if (typeof value !== 'string') return;
                if (entry.node) {
                    const original = entry.node.nodeValue || '';
                    const leading = original.match(/^\s*/)?.[0] || '';
                    const trailing = original.match(/\s*$/)?.[0] || '';
                    entry.node.nodeValue = `${leading}${value.trim()}${trailing}`;
                } else if (entry.element?.isConnected) {
                    entry.element.setAttribute(entry.name, value);
                }
            });
        }
    }

    async function translateLandingContent(language) {
        if (!isLandingPath()) return;
        const token = ++landingTranslationToken;
        if (language === 'en') {
            restoreLandingOriginal();
            return;
        }
        document.documentElement.lang = 'en';
        const textEntries = getLandingTextNodes().map((node) => ({ node, value: landingTextOriginals.get(node) }));
        const attributeEntries = getLandingAttributes();
        try {
            await translateLandingEntries([...textEntries, ...attributeEntries], language, token);
        } catch (error) {
            if (token === landingTranslationToken) console.warn('Landing translation is unavailable.', error);
        }
    }

    function scheduleLandingContentTranslation() {
        if (!isLandingPath()) return;
        window.clearTimeout(landingTranslationTimer);
        const language = getSavedLanguage();
        landingTranslationTimer = window.setTimeout(() => translateLandingContent(language), 180);
    }

    function refreshLandingTranslation() {
        if (!isLandingPath()) return;
        const language = getSavedLanguage();
        if (language === 'en' || !getGoogleSelect()) return;
        const now = Date.now();
        if (now - lastLandingRefresh < 1800) return;
        lastLandingRefresh = now;
        setGoogleLanguage(language, { reload: false });
    }

    function scheduleLandingTranslation() {
        if (!isLandingPath()) return;
        [450, 1200, 2600].forEach((delay) => window.setTimeout(refreshLandingTranslation, delay));
    }

    window.googleTranslateElementInit = function () {
        if (googleReady || googleInitializing || !window.google || !window.google.translate) return;
        googleInitializing = true;
        try {
            new window.google.translate.TranslateElement({
                pageLanguage: 'en',
                autoDisplay: false,
                multilanguagePage: true
            }, 'google_translate_element');
            googleReady = true;
        } finally {
            googleInitializing = false;
        }
        window.setTimeout(() => {
            applyPendingLanguage();
            waitForGoogleSelect();
        }, 100);
    };

    function loadGoogleTranslate() {
        if (document.getElementById('google_translate_script')) return;
        const script = document.createElement('script');
        script.id = 'google_translate_script';
        script.async = true;
        script.src = `https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit&v=${Date.now()}`;
        script.onerror = () => {
            script.remove();
            if (googleScriptAttempts++ < 2) window.setTimeout(loadGoogleTranslate, 1800);
        };
        document.head.append(script);
    }

    function hideGoogleChrome() {
        document.querySelectorAll('iframe.goog-te-banner-frame, .goog-te-banner-frame, body > .skiptranslate, #goog-gt-tt, .goog-tooltip, .goog-text-highlight').forEach((element) => {
            element.style.setProperty('display', 'none', 'important');
            element.style.setProperty('visibility', 'hidden', 'important');
        });
        document.documentElement.style.setProperty('top', '0px', 'important');
        document.body?.style.setProperty('top', '0px', 'important');
    }

    function loadStyles() {
        if (document.querySelector('link[href$="css/translate.css"]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL('/css/translate.css', window.location.origin).href;
        document.head.append(link);
    }

    function closeMenus(except) {
        document.querySelectorAll('[data-translate-switcher]').forEach((switcher) => {
            if (switcher === except) return;
            const toggle = switcher.querySelector('.translate-toggle');
            const menu = switcher._translateMenu || switcher.querySelector('.translate-menu');
            if (menu) menu.hidden = true;
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
        });
    }

    function positionMobileMenu(switcher) {
        if (!switcher?.classList.contains('translate-mobile-switcher')) return;
        const header = document.querySelector('.site-header');
        const headerBottom = header?.getBoundingClientRect().bottom || 78;
        const top = `${Math.max(12, Math.round(headerBottom + 8))}px`;
        switcher.style.setProperty('--translate-menu-top', top);
        switcher._translateMenu?.style.setProperty('--translate-menu-top', top);
    }

    function repositionOpenMobileMenu() {
        document.querySelectorAll('.translate-mobile-switcher').forEach((switcher) => {
            const menu = switcher._translateMenu || switcher.querySelector('.translate-menu');
            if (menu && !menu.hidden) positionMobileMenu(switcher);
        });
    }

    function wireSwitcher(switcher) {
        const toggle = switcher.querySelector('.translate-toggle');
        const menu = switcher.querySelector('.translate-menu');
        const close = switcher.querySelector('.translate-menu-close');
        const search = switcher.querySelector('.translate-search');
        const list = switcher.querySelector('.translate-language-list');
        const reset = switcher.querySelector('[data-translate-reset]');
        if (switcher.classList.contains('translate-mobile-switcher')) {
            menu.classList.add('translate-mobile-overlay');
            document.body.append(menu);
            switcher._translateMenu = menu;
        }
        renderLanguages(list, '');
        toggle.addEventListener('click', () => {
            const open = menu.hidden;
            closeMenus(switcher);
            if (open) positionMobileMenu(switcher);
            menu.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            if (open) window.setTimeout(() => search.focus(), 0);
        });
        close.addEventListener('click', () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
        search.addEventListener('input', () => renderLanguages(list, search.value));
        list.addEventListener('click', (event) => {
            const option = event.target.closest('[data-language]');
            if (!option) return;
            setGoogleLanguage(option.dataset.language, { syncUrl: true });
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
        });
        reset.addEventListener('click', () => {
            setGoogleLanguage('en', { syncUrl: true });
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
        });
    }

    function init() {
        primeLanguageFromUrl();
        loadStyles();
        hideGoogleChrome();
        new MutationObserver(hideGoogleChrome).observe(document.body, { childList: true, subtree: true });
        if (!document.getElementById('google_translate_element')) {
            const googleHost = document.createElement('div');
            googleHost.id = 'google_translate_element';
            googleHost.setAttribute('aria-hidden', 'true');
            googleHost.className = 'notranslate';
            googleHost.setAttribute('translate', 'no');
            document.body.append(googleHost);
        }
        const googleHost = document.getElementById('google_translate_element');
        googleHost?.classList.add('notranslate');
        googleHost?.setAttribute('translate', 'no');
        document.documentElement.setAttribute('translate', 'yes');
        document.body.setAttribute('translate', 'yes');
        if (!document.querySelector('[data-translate-switcher]')) {
            const { element, mode } = getHost();
            const switcher = buildSwitcher();
            placeSwitcher(switcher, element, mode);
            wireSwitcher(switcher);
            if (element.matches('.site-header .nav-actions')) {
                const navbarContainer = document.querySelector('.site-header .navbar > .container');
                const navbarToggler = navbarContainer?.querySelector('.navbar-toggler');
                if (navbarContainer && navbarToggler) {
                    const mobileSwitcher = buildSwitcher();
                    mobileSwitcher.classList.add('translate-mobile-switcher');
                    navbarContainer.insertBefore(mobileSwitcher, navbarToggler);
                    wireSwitcher(mobileSwitcher);
                }
            }
            if (element.matches('.admin-header-actions')) {
                const adminLoginCard = document.querySelector('.admin-login-card');
                if (adminLoginCard) {
                    const loginSwitcher = buildSwitcher();
                    loginSwitcher.classList.add('translate-standalone');
                    adminLoginCard.append(loginSwitcher);
                    wireSwitcher(loginSwitcher);
                }
            }
        }
        document.addEventListener('click', (event) => {
            if (!event.target.closest('[data-translate-switcher], .translate-mobile-overlay')) closeMenus();
        });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenus(); });
        window.addEventListener('resize', repositionOpenMobileMenu);
        window.addEventListener('scroll', repositionOpenMobileMenu, { passive: true });
        window.addEventListener('inbestmen:content-updated', () => {
            refreshLanguageOptions();
        });
        loadGoogleTranslate();
        window.setTimeout(hideGoogleChrome, 250);
        window.setTimeout(hideGoogleChrome, 1000);
        if (googleReady) applyPendingLanguage();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
