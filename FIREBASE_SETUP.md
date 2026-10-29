# inBestmen Firebase setup

The first Dashboard pass is ready in `auth.html` and `dashboard.html`.

## 1. Create the Firebase Web App

1. Create or open the inBestmen project in Firebase Console.
2. Add a Web App and copy its configuration into `js/firebase-config.js`.
3. Add your production Vercel domain and local development domain under Authentication > Settings > Authorized domains.

## 2. Enable sign-in methods

Under Authentication > Sign-in method, enable:

- Google provider
- Email/password provider

The login screen already supports Google popup sign-in, email/password sign-in and account creation.

## 3. Recommended Firestore shape

The UI is currently using demo data. The next backend pass can map it to these collections:

```text
users/{uid}
  displayName
  email
  ibBalance
  createdAt

projects/{projectId}
  name
  category
  location
  summary
  ibRaised
  ibGoal
  status

users/{uid}/support/{projectId}
  amount
  createdAt
```

Do not trust client-side balances. PayPal webhooks and a server-side transaction ledger must be the source of truth before real money or iB Coins are enabled.

## 4. Admin Console

The private management console is available at `/admin` (the static file is `admin.html`) and includes preview views for:

- ElevenLabs agent supervision and intake sessions
- board project review and approval actions
- PayPal contribution reconciliation and project payout obligations
- completed projects and final reports

Copy `js/admin-config.example.js` to `js/admin-config.js` and replace the example address with approved team emails for the interface gate. For production, also set a Firebase custom claim such as `{ admin: true }` or `{ manager: true }` from a trusted server. Firestore rules and API routes must enforce that claim; the browser email list is only a convenience gate and is not a security boundary.

Keep ElevenLabs private keys and PayPal secrets in Vercel server-side environment variables. The browser should receive only short-lived signed URLs or server responses.

## 5. Telegram project intake

The public “Submit an idea” buttons now open the official Telegram project form at [t.me/inBestmenbot](https://t.me/inBestmenbot). Founders complete the structured intake directly with the ElevenLabs agent in Telegram; the website no longer requests a phone number or initiates AI phone calls.

In ElevenLabs, connect the Telegram bot token from BotFather, enable the Telegram Message trigger and select the inBestmen Project Intake Agent. Telegram registers the webhook automatically. Keep this bot dedicated to inBestmen or disconnect the previous agent before connecting it here, because one bot should not be controlled by two webhook integrations at the same time.

The agent should collect the founder's name, email, Telegram username/chat ID, project name, location, category, idea, beneficiaries, solution, stage, team, budget, impact, timeline and risks. It must disclose that it is an AI assistant, ask for consent, speak in the selected language, prepare a structured project summary and mark it `pending_human_review`. It must never promise funding or make the final approval decision.

The current site only needs `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` for server-side ElevenLabs features. Telegram bot authentication is managed in the ElevenLabs integration and must not be placed in public website code.

## 6. Local preview

The committed placeholder config keeps the Dashboard in Preview mode. Replace its values to activate Firebase. Do not put PayPal or AI secrets in this browser configuration.
