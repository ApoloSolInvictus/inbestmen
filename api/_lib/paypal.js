const getPayPalConfig = () => {
    const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
    const environment = String(process.env.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
    const currency = String(process.env.PAYPAL_CURRENCY || 'USD').toUpperCase();
    if (!clientId || !clientSecret) throw Object.assign(new Error('PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in Vercel.'), { statusCode: 503 });
    return { clientId, clientSecret, environment, currency, baseUrl: environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com' };
};

let accessTokenCache = { token: null, expiresAt: 0, environment: null };

const getAccessToken = async () => {
    const config = getPayPalConfig();
    if (accessTokenCache.token && accessTokenCache.environment === config.environment && accessTokenCache.expiresAt > Date.now() + 60000) return { config, token: accessTokenCache.token };
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: 'grant_type=client_credentials' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) throw Object.assign(new Error('PayPal could not issue an access token.'), { statusCode: 503 });
    accessTokenCache = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 32400) * 1000, environment: config.environment };
    return { config, token: data.access_token };
};

export const getPayPalPublicConfig = () => {
    const config = getPayPalConfig();
    return { clientId: config.clientId, environment: config.environment, currency: config.currency };
};

export const payPalRequest = async (path, options = {}) => {
    const { config, token } = await getAccessToken();
    const response = await fetch(`${config.baseUrl}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.details?.[0]?.description || data.message || `PayPal request failed (${response.status}).`);
        error.statusCode = response.status >= 500 ? 503 : response.status;
        throw error;
    }
    return data;
};

export const createPayPalOrder = async ({ amount, uid, currency }) => payPalRequest('/v2/checkout/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'PayPal-Request-Id': `inbestmen-create-${uid}-${Date.now()}` },
    body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ custom_id: uid, description: `${amount} iB Coins`, amount: { currency_code: currency, value: Number(amount).toFixed(2) } }]
    })
});

export const getPayPalOrder = async (orderId) => payPalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);

export const capturePayPalOrder = async (orderId) => payPalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'PayPal-Request-Id': `inbestmen-capture-${orderId}` }, body: '{}' });
