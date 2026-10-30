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

The dashboard ships with a clearly labelled sample catalog so the experience can be previewed before the first approved projects are published. Live project totals and user donations use these collections:

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
  proposalUrl
  updatedAt

users/{uid}/support/{projectId}
  projectId
  ibDonated
  updatedAt

projectDonations/{donationId}
  uid
  projectId
  amountIb
  status
  createdAt
```

Do not trust client-side balances. PayPal capture plus the server-side Firestore commit is the source of truth. A project donation atomically decrements `users/{uid}.ibBalance`, increments `projects/{projectId}.ibRaised`, updates the user's support aggregate and records a unique donation in `projectDonations`.

## 4. Admin Console

The private management console is available at `/admin` (the static file is `admin.html`) and includes preview views for:

- ElevenLabs agent supervision and intake sessions
- board project review and approval actions
- PayPal contribution reconciliation and project payout obligations
- completed projects and final reports

Copy `js/admin-config.example.js` to `js/admin-config.js` and replace the example address with approved team emails for the interface gate. For production, also set a Firebase custom claim such as `{ admin: true }` or `{ manager: true }` from a trusted server. Firestore rules and API routes must enforce that claim; the browser email list is only a convenience gate and is not a security boundary.

Keep ElevenLabs private keys and PayPal secrets in Vercel server-side environment variables. The browser should receive only short-lived signed URLs or server responses.

## 5. PayPal iB Coin wallet

The user dashboard now uses the PayPal Orders v2 flow. The server creates the order, PayPal renders the approval button, the server captures the approved order and Firestore credits the same number of iB Coins as USD paid. The wallet balance is stored server-side in `users/{uid}.ibBalance`; each successful order is recorded once in `paypalTransactions/{orderId}` so a repeated approval cannot credit the wallet twice.

In the PayPal Developer Dashboard, create an app under the merchant account and copy these values into Vercel Project Settings → Environment Variables for the appropriate deployment:

```text
PAYPAL_CLIENT_ID=your-paypal-app-client-id
PAYPAL_CLIENT_SECRET=your-paypal-app-secret
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_CURRENCY=USD
```

Use `sandbox` while testing with PayPal sandbox buyer accounts. Use `live` only after the merchant account and application are approved for real payments. Never put `PAYPAL_CLIENT_SECRET` in HTML, JavaScript or GitHub. The PayPal account used to create the app is the merchant account that receives the payment; a separate business email variable is not required by this checkout flow. Firebase server variables must also be configured: `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` and a real Firebase Web App config in `js/firebase-config.js`.

After adding the variables, redeploy Vercel and sign in with a real Firebase account. Open **inBest Money**, choose an amount and complete a sandbox checkout. The wallet should update only after the protected capture endpoint verifies the PayPal order, amount, currency and signed-in Firebase user. PayPal Orders API credentials and server-side order/capture handling are required; do not trust a client-side balance.

## 6. Project proposals and iB Coin donations

Every active project card in **inBest Projects** now includes:

- **View proposal**, which opens the project's external proposal URL or the shared `project-proposal.html?id=...` page.
- An iB Coin amount selector and **Donate**, which sends an authenticated request to `/api/projects/donate`.
- Live progress based on `projects/{projectId}.ibRaised` and `ibGoal`.

The catalog endpoint is `/api/projects/list` and the signed-in user's support history is `/api/projects/support`. Both routes require a Firebase ID token. The donation endpoint rejects insufficient balances, invalid amounts and contributions that would exceed the approved project goal. The server uses a Firestore optimistic commit so the wallet and project total move together.

For a safe visual walkthrough, the wallet has **Try sample wallet**. It loads 21 example iB Coins entirely in the browser so a test donation can visibly reduce the balance and increase a project total. The UI labels this mode clearly and never calls PayPal or Firestore while it is active. Exit sample wallet before testing a real authenticated wallet.

## 7. Telegram project intake

The public “Submit an idea” buttons now open the official Telegram project form at [t.me/inBestmenbot](https://t.me/inBestmenbot). Founders complete the structured intake directly with the ElevenLabs agent in Telegram; the website no longer requests a phone number or initiates AI phone calls.

In ElevenLabs, connect the Telegram bot token from BotFather, enable the Telegram Message trigger and select the inBestmen Project Intake Agent. Telegram registers the webhook automatically. Keep this bot dedicated to inBestmen or disconnect the previous agent before connecting it here, because one bot should not be controlled by two webhook integrations at the same time.

The agent should collect the founder's name, email, Telegram username/chat ID, project name, location, category, idea, beneficiaries, solution, stage, team, budget, impact, timeline and risks. It must disclose that it is an AI assistant, ask for consent, speak in the selected language, prepare a structured project summary and mark it `pending_human_review`. It must never promise funding or make the final approval decision.

The current site uses `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` for server-side ElevenLabs features. Telegram bot authentication is managed in the ElevenLabs integration and must not be placed in public website code.

## 8. Web agent widget

The public homepage includes the official ElevenLabs Conversational AI widget using the `inBestmen Project Intake Agent` ID. The widget is a secondary web conversation; the official project submission route remains Telegram.

The widget supports private agents by requesting a short-lived signed URL from `/api/elevenlabs/signed-url`; the API key stays on Vercel. If you prefer to use the agent ID directly, ElevenLabs requires the widget agent to be public with authentication disabled. An allowlist can still restrict the public widget to `inbestmen.wstudio3d.com`. The widget follows ElevenLabs' official embed pattern and is loaded from the official embed package.

## 9. Live admin connection

The admin console now has live ElevenLabs panels for the configured agent, recent conversations, summaries and full conversation detail. The browser sends the current Firebase ID token, and the Vercel functions validate its signature before calling ElevenLabs.

Add these Vercel environment variables:

```text
ELEVENLABS_API_KEY=the-private-key-from-elevenlabs
ELEVENLABS_AGENT_ID=agent_1801m62c1ranf3y9g9p4v2hd7g1v
ELEVENLABS_ENVIRONMENT=production
FIREBASE_PROJECT_ID=your-firebase-project-id
INBESTMEN_ADMIN_EMAILS=approved-team@example.com
```

An approved Firebase administrator can then open `/admin`, choose “ElevenLabs agents” and use Refresh. The admin email list is only one authorization option; `{ admin: true }` or `{ manager: true }` Firebase custom claims are also accepted. The same authorization must be enforced in Firebase and any future payment routes.

## 10. Project JSON capture

ElevenLabs Data collection should be enabled in the agent's Analysis settings. Create fields with these identifiers so the platform can map the conversation into the inBestmen project brief:

```text
founder_name, email, telegram_username, project_name, location, category,
problem, beneficiaries, proposed_solution, stage, team, budget_usd,
impact, timeline, risks, next_stage
```

Configure an ElevenLabs post-call transcription webhook at:

```text
https://inbestmen.wstudio3d.com/api/elevenlabs/webhook
```

Use HMAC authentication, copy the generated signing secret to `ELEVENLABS_WEBHOOK_SECRET` in Vercel and enable the transcription event. The endpoint validates the `ElevenLabs-Signature`, normalizes the collected fields into `inbestmen.project-brief.v1`, and writes one idempotent document per conversation to Firestore.

For durable storage, also configure:

```text
FIREBASE_SERVICE_ACCOUNT_JSON=the-one-line-service-account-json
```

The service account must have permission to write to the Firestore database. If the secret or Firestore configuration is missing, the webhook intentionally returns an error so ElevenLabs can retry instead of silently losing a project brief. Do not commit the service account JSON or webhook secret.

The optional `ELEVENLABS_PROJECT_DATA_COLLECTION_IDS` variable can contain the comma-separated Data collection IDs. When present, the admin conversation list requests those extracted values from ElevenLabs. The stored brief remains marked `pending_human_review` or `needs_more_information`; the AI never approves funding.

## 11. OpenAI second-stage screening

The ElevenLabs post-call webhook now sends the normalized project brief through the OpenAI Responses API before saving it to Firestore. OpenAI returns Structured Outputs containing a review summary, quality score, strengths, missing information, follow-up questions, risk flags and the next stage. The next stage is restricted to `pending_human_review` or `needs_more_information`; it is never a funding approval.

Add these Vercel variables:

```text
OPENAI_API_KEY=the-server-side-openai-key
OPENAI_SCREENING_MODEL=gpt-5-mini
```

The key must remain in Vercel and must not be placed in browser code. The manual `/api/ai/screen-project` route now requires an approved Firebase admin session, so an anonymous visitor cannot spend OpenAI credits through that endpoint. The automated webhook uses the server-side key and does not require a browser session.

If OpenAI is unavailable, the webhook returns an error instead of storing an unreviewed brief, allowing the provider to retry the delivery. The admin console then shows the saved OpenAI summary, score and status from Firestore.

## 12. Recover completed ElevenLabs conversations

The admin console includes a protected **Sync calls** action under ElevenLabs agents. It retrieves up to ten recent conversations from the configured agent, fetches each full conversation, runs the same OpenAI screening used by the post-call webhook, and stores only conversations that are not already present in Firestore. This recovers calls that finished before the webhook was enabled or while a webhook delivery failed; it is limited to approved Firebase management sessions.

The console starts with no project, payment or completed-project demo records. If a reset is needed, an approved administrator can use **Clear data** and type `RESET`; this permanently removes all stored project briefs from the `elevenlabsProjectBriefs` Firestore collection and records a new intake baseline. The action does not delete conversations from ElevenLabs, PayPal events or user accounts, but future Sync calls ignore conversations that ended before the baseline.

For future conversations, keep the `post_call_transcription` webhook enabled with HMAC authentication and retries. ElevenLabs requires a successful 2xx response and may disable a webhook after repeated failures, so the sync action is a recovery path, not a replacement for the webhook.

The board packet shown in the admin console includes the structured JSON, transcript metadata, AI review and screening status. It is an operational evidence document only. A licensed accountant and qualified legal counsel must validate tax, accounting, securities, privacy and regulatory conclusions before any investor presentation, fundraising or payout.

From **Project review**, **Open packet** displays the board summary, captured founder/project fields, ElevenLabs transcript and the complete source JSON. **Remove from list** deletes only the stored Firestore brief and records its conversation ID as ignored, so a later Sync calls action will not re-import it. The original ElevenLabs conversation is preserved in ElevenLabs for audit history.

When a brief has status `pending_human_review`, the Admin packet also shows **Approve to projects**. That protected action writes the decision to the brief, creates `projects/{projectId}` and publishes a public-safe packet for the user Dashboard. It intentionally excludes founder email, Telegram identifiers and the raw transcript from the public packet; the Admin retains the complete JSON and evidence.

## 13. Local preview

The committed placeholder config keeps the Dashboard in Preview mode. Replace its values to activate Firebase. Do not put PayPal or AI secrets in this browser configuration.
