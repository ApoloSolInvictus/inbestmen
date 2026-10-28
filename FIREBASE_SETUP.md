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

## 5. ElevenLabs voice intake calls

The public “Submit an idea” form now collects the founder's email, E.164 phone number, preferred call language and explicit call consent. It posts to `/api/elevenlabs/outbound-call`; the server calls ElevenLabs and never exposes `ELEVENLABS_API_KEY` to the browser.

Configure an ElevenLabs Conversational AI agent with a Twilio phone number imported and assigned to that agent. Add these Vercel environment variables:

```text
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_AGENT_PHONE_NUMBER_ID=
ELEVENLABS_ENVIRONMENT=production
ELEVENLABS_CALL_RECORDING_ENABLED=false
```

The outbound request passes these dynamic variables to the agent: `project_name`, `founder_name`, `contact_email`, `contact_phone`, `project_location`, `project_category`, `project_idea`, `preferred_language` and `preferred_language_code`, and applies the selected base language to the conversation configuration. The agent voice and model must support the languages enabled in the form. Add instructions in the agent prompt to conduct the complete intake in `{{preferred_language}}`, ask the predetermined questions, never promise funding, and confirm that the founder is ready before ending the call.

The endpoint uses ElevenLabs' native Twilio outbound-call API, which requires an agent ID, imported phone-number ID and destination number. See the [official outbound-call reference](https://elevenlabs.io/docs/api-reference/integrations/twilio/outbound-call). Add rate limiting, abuse protection and jurisdiction-specific consent review before opening outbound calling to unrestricted public traffic.

## 6. Local preview

The committed placeholder config keeps the Dashboard in Preview mode. Replace its values to activate Firebase. Do not put PayPal or AI secrets in this browser configuration.
