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

## 4. Local preview

The committed placeholder config keeps the Dashboard in Preview mode. Replace its values to activate Firebase. Do not put PayPal or AI secrets in this browser configuration.
