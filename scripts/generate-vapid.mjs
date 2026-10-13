#!/usr/bin/env node
/**
 * Prints a fresh VAPID key pair for the push server.
 *
 *   npm run vapid
 *
 * Put the two values in the server's environment (`.env`, docker-compose, or
 * your host's dashboard). The private key stays on the server; the public key is
 * served to the app from `GET /api/push/pubkey`, so it never has to be baked
 * into the build. Keep the same pair forever — every device's subscription is
 * signed with it.
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('# Paste these into your server environment:');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@example.com');
