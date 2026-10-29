(function () {
    const host = document.getElementById('inbestmenAgentWidget');
    if (!host) return;

    const agentId = host.dataset.agentId;
    const showWidget = (signedUrl) => {
        const widget = document.createElement('elevenlabs-convai');
        if (signedUrl) widget.setAttribute('signed-url', signedUrl);
        else widget.setAttribute('agent-id', agentId);
        widget.setAttribute('variant', 'expanded');
        host.replaceChildren(widget);
    };

    fetch('/api/elevenlabs/signed-url', { headers: { Accept: 'application/json' } })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => showWidget(data?.signedUrl || null))
        .catch(() => showWidget(null));
})();
