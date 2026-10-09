# Fingerprint / passkey sign-in

Version 0.4.4 adds a passkey-first app screen and enrollment using the official
`@supabase/auth-js` SDK pinned to 2.117.3. Supabase's passkey feature is currently
experimental. It must be enabled before either enrollment or sign-in can work.

## Activation

In the existing Supabase project `nadjsybjfarnkerrsgmx`, open Authentication > Passkeys:

- Enable passkeys (`passkey_enabled: true`).
- Relying-party display name: `myPKR`.
- Relying-party ID: `david-personal-knowledge.netlify.app` (hostname only).
- Allowed origin: `https://david-personal-knowledge.netlify.app`.

Management API equivalents are `webauthn_rp_display_name`, `webauthn_rp_id`, and
`webauthn_rp_origins`. Do not change the RP ID after enrollment without a migration
plan: saved passkeys are tied to it. Preview deploys intentionally cannot enroll
or use production credentials. No database migration or service-role key is required.

The connected Supabase tool currently cannot update Auth configuration. Use the
authenticated dashboard or an authorized Management API client; do not look for
dashboard tokens or edit internal Auth tables. As of the pre-release check on
2026-10-09, the public Auth settings reported `passkeys_enabled: false`.

Netlify team-login protection currently covers all deploys and runs before this
application. It is unchanged by this release. To make fingerprint the first
screen on every production launch, complete and verify passkey setup, then change
Netlify team-login protection to non-production deploys only. Keep the existing
Supabase confirmed-account/approved-owner checks and database RLS. This changes
who can load the sign-in shell, not who can read records. Do not claim the complete
fingerprint-first flow is active while the Netlify gate still runs in front of it.

## Device setup and behavior

1. Open the production URL in the device's browser and sign in with the existing password.
2. Open **Fingerprint sign-in** and choose **Set up fingerprint**.
3. Complete the operating-system passkey prompt on the actual device.
4. Close/reopen myPKR and complete the automatic prompt. If the browser requires
   interaction, tap **Unlock with fingerprint**. Password remains a fallback.

On confirmed enrollment or an owner-approved passkey sign-in, one local preference
(`mypkr.passkey.auto.v1=1`) enables an automatic attempt at the next launch. It
contains no identity or credential and grants no access. If browser storage is
blocked/cleared or a different browser profile is used, manual unlock still works.
The OS can offer fingerprint, face, PIN, security key, or another passkey provider;
the web app cannot force a specific biometric. A cancelled prompt does not loop.

Sessions and refresh tokens stay only in memory. Reload/pagehide, sign-out, expiry,
and inactivity clear the workspace. Backgrounding an unlocked app also locks it;
returning requests a passkey when this device preference exists. Native passkey
ceremonies are exempt from visibility locking because their dialogs can hide the
page. Pagehide still aborts the ceremony. Late results cannot reopen a reset page.

The SDK is bundled locally into one explicit asset. No CDN scripts, session URL
parsing, background token refresh, offline records, or persistent tokens are added.
All record API calls still validate the user and owner authorization server-side.

## Verification

Run `npm ci` and `npm run check`. Tests cover first-use fallback, automatic launch,
cancellation without looping, unsupported/disabled service, rejected owner access,
late responses after reset/password fallback, and confirmed enrollment only.
Existing backend tests cover missing, unconfirmed, and unapproved identities.

Physical enrollment, fingerprint verification, reopening the installed app, and
the production Auth RP configuration must be verified on the owner's device.
Unit tests are not proof of a successful live biometric ceremony.

References: https://supabase.com/docs/guides/auth/passkeys and
https://supabase.com/docs/reference/javascript/auth-signinwithpasskey.
