(() => {
    const tokenPattern = /\biB\b|\binBest Coins\b/g;
    const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA']);
    const skipSelectors = '.planet-mark, .brand-lockup, .brand-logo-image, .coin-token';

    const makeToken = () => {
        const token = document.createElement('span');
        token.className = 'coin-token';
        token.setAttribute('role', 'img');
        token.setAttribute('aria-label', 'iB Coin');

        const image = document.createElement('img');
        image.src = 'images/inbestmen-favicon.png';
        image.alt = '';
        token.appendChild(image);
        return token;
    };

    const shouldSkip = (node) => {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return !element || skipTags.has(element.tagName) || Boolean(element.closest(skipSelectors));
    };

    const replaceTextNode = (node) => {
        if (node.nodeType !== Node.TEXT_NODE || shouldSkip(node)) return;
        const value = node.nodeValue || '';
        const matches = [...value.matchAll(tokenPattern)];
        if (!matches.length) return;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        matches.forEach((match) => {
            const index = match.index;
            if (index > lastIndex) fragment.appendChild(document.createTextNode(value.slice(lastIndex, index)));
            fragment.appendChild(makeToken());
            if (match[0] === 'inBest Coins') fragment.appendChild(document.createTextNode(' Coins'));
            lastIndex = index + match[0].length;
        });
        if (lastIndex < value.length) fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
        node.replaceWith(fragment);
    };

    const scan = (root) => {
        if (root.nodeType === Node.TEXT_NODE) {
            replaceTextNode(root);
            return;
        }
        if (root.nodeType !== Node.ELEMENT_NODE || skipTags.has(root.tagName) || root.matches(skipSelectors)) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) textNodes.push(node);
        textNodes.forEach(replaceTextNode);
    };

    const start = () => {
        scan(document.body);
        new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
