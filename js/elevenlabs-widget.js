(function () {
    const host = document.getElementById('inbestmenAgentWidget');
    if (!host) return;

    const agentId = host.dataset.agentId;
    host.classList.add('notranslate');
    host.setAttribute('translate', 'no');
    const localeAliases = { iw: 'he', jw: 'jv' };
    const localePattern = /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i;
    let signedUrl = '';
    let mountedLocale = '';

    const getConversationLocale = () => {
        const pathLocale = window.location.pathname.split('/').filter(Boolean)[0] || '';
        const savedLocale = window.localStorage.getItem('inbestmen_language') || '';
        const documentLocale = document.documentElement.lang || '';
        const candidate = [pathLocale, savedLocale, documentLocale].find((value) => localePattern.test(value));
        const locale = String(candidate || 'en').replace('_', '-').toLowerCase();
        return localeAliases[locale] || locale;
    };

    const showWidget = async (signedUrl) => {
        if (customElements.get('elevenlabs-convai')) {
            return mountWidget(signedUrl);
        }

        try {
            await customElements.whenDefined('elevenlabs-convai');
        } catch (_error) {
            host.innerHTML = '<p class="agent-widget-error">The web conversation could not be loaded. Please use Telegram to submit your project.</p>';
            return;
        }

        mountWidget(signedUrl);
    };

    const mountWidget = (nextSignedUrl) => {
        const locale = getConversationLocale();
        if (mountedLocale === locale && host.querySelector('elevenlabs-convai')) return;
        mountedLocale = locale;
        const widget = document.createElement('elevenlabs-convai');
        if (nextSignedUrl) widget.setAttribute('signed-url', nextSignedUrl);
        else widget.setAttribute('agent-id', agentId);
        widget.setAttribute('language', locale);
        widget.setAttribute('override-language', locale);
        widget.setAttribute('dynamic-variables', JSON.stringify({ preferred_language: locale }));
        widget.setAttribute('variant', 'expanded');
        widget.setAttribute('dismissible', 'false');
        widget.dataset.conversationLanguage = locale;
        host.replaceChildren(widget);
    };

    fetch('/api/elevenlabs/signed-url', { headers: { Accept: 'application/json' } })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
            signedUrl = data?.signedUrl || '';
            return showWidget(signedUrl);
        })
        .catch(() => showWidget(null));

    window.addEventListener('inbestmen:language-changed', () => {
        if (host.querySelector('elevenlabs-convai')) mountWidget(signedUrl);
    });
})();
