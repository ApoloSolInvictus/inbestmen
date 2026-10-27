import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const config = window.INBESTMEN_FIREBASE_CONFIG;
const status = document.getElementById('authStatus');
const showStatus = (message, error = false) => { status.textContent = message; status.className = `auth-status show${error ? ' error' : ''}`; };
const configReady = config && config.apiKey && !config.apiKey.includes('YOUR_');

if (!configReady) showStatus('Preview mode: copy firebase-config.example.js to firebase-config.js and add your Firebase Web App config to activate sign-in.');

let auth;
if (configReady) auth = getAuth(initializeApp(config));
const provider = new GoogleAuthProvider();
const goToDashboard = (user) => { localStorage.setItem('inbestmen_user', JSON.stringify({ name: user.displayName || user.email?.split('@')[0] || 'Member', email: user.email || '' })); window.location.href = 'dashboard.html'; };

document.getElementById('googleSignIn').addEventListener('click', async () => {
    if (!auth) return showStatus('Firebase is not connected yet. Add your Web App configuration first.');
    try { const result = await signInWithPopup(auth, provider); goToDashboard(result.user); } catch (error) { showStatus(error.message || 'Google sign-in could not be completed.', true); }
});

document.getElementById('emailSignIn').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!auth) return showStatus('Firebase is not connected yet. Add your Web App configuration first.');
    const email = document.getElementById('email').value.trim(); const password = document.getElementById('password').value;
    try { const result = await signInWithEmailAndPassword(auth, email, password); goToDashboard(result.user); } catch (error) { showStatus(error.message || 'Email sign-in could not be completed.', true); }
});

document.getElementById('guestSignIn').addEventListener('click', () => {
    localStorage.setItem('inbestmen_user', JSON.stringify({ name: 'Guest Member', email: 'Preview mode' }));
    window.location.href = 'dashboard.html';
});
