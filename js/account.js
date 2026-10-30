import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import './coin-mark.js';

if (!document.querySelector('script[src="js/translate.js"]')) { const script = document.createElement('script'); script.src = 'js/translate.js'; script.defer = true; document.body.append(script); }

const config = window.INBESTMEN_FIREBASE_CONFIG;
const status = document.getElementById('accountStatus');
const showStatus = (message, error = false) => { status.textContent = message; status.className = `auth-status show${error ? ' error' : ''}`; };
const configReady = config && config.apiKey && !config.apiKey.includes('YOUR_');
let auth = null;
if (configReady) auth = getAuth(initializeApp(config));
if (!configReady) showStatus('Preview mode: connect Firebase to activate account actions.');
const goToDashboard = (user) => { localStorage.setItem('inbestmen_user', JSON.stringify({ name: user.displayName || user.email?.split('@')[0] || 'Member', email: user.email || '' })); window.location.href = 'dashboard.html'; };

const registerForm = document.getElementById('registerForm');
if (registerForm) registerForm.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!auth) return showStatus('Firebase is not connected yet. Add your Web App configuration first.');
    const name = document.getElementById('registerName').value.trim(); const email = document.getElementById('registerEmail').value.trim(); const password = document.getElementById('registerPassword').value;
    try { const result = await createUserWithEmailAndPassword(auth, email, password); await updateProfile(result.user, { displayName: name }); goToDashboard(result.user); } catch (error) { showStatus(error.message || 'Account creation could not be completed.', true); }
});

const resetForm = document.getElementById('resetForm');
if (resetForm) resetForm.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!auth) return showStatus('Firebase is not connected yet. Add your Web App configuration first.');
    try { await sendPasswordResetEmail(auth, document.getElementById('resetEmail').value.trim()); showStatus('Reset link sent. Check your inbox and follow the secure link.'); resetForm.reset(); } catch (error) { showStatus(error.message || 'We could not send the reset link.', true); }
});
