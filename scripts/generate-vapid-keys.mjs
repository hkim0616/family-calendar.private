/**
 * Generates the VAPID keypair used to sign push notifications.
 *
 *   node scripts/generate-vapid-keys.mjs
 *
 * Run this ONCE. The keys identify this app to Apple's and Google's push
 * services. If you regenerate them later, every phone's existing subscription
 * stops working and everyone has to tap "Turn on reminders" again.
 *
 * Nothing is written to disk on purpose — the private key must never be
 * committed. Copy the values straight into Vercel's environment variables.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
╭──────────────────────────────────────────────────────────────────────────╮
│  VAPID keys generated. Add these to Vercel:                              │
│  Project Settings → Environment Variables                                │
╰──────────────────────────────────────────────────────────────────────────╯

NEXT_PUBLIC_VAPID_PUBLIC_KEY
${publicKey}

VAPID_PRIVATE_KEY
${privateKey}

  • NEXT_PUBLIC_VAPID_PUBLIC_KEY is sent to phones. Safe to expose.
  • VAPID_PRIVATE_KEY is a secret. Never commit it or paste it in a chat.

Also set VAPID_SUBJECT to a contact address, e.g. mailto:you@example.com
(push services use it to reach you if something goes wrong).
`);
