(function () {
    const host = document.getElementById('inbestmenAgentWidget');
    if (!host) return;

    const agentId = host.dataset.agentId;
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

    const mountWidget = (signedUrl) => {
        const widget = document.createElement('elevenlabs-convai');
        if (signedUrl) widget.setAttribute('signed-url', signedUrl);
        else widget.setAttribute('agent-id', agentId);
        widget.setAttribute('variant', 'expanded');
        widget.setAttribute('dismissible', 'false');
        widget.setAttribute('start-call-text', 'Start web conversation');
        widget.setAttribute('end-call-text', 'End web conversation');
        host.replaceChildren(widget);
    };

    fetch('/api/elevenlabs/signed-url', { headers: { Accept: 'application/json' } })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => showWidget(data?.signedUrl || null))
        .catch(() => showWidget(null));
})();
