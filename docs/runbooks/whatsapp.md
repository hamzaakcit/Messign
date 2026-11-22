# Runbook: WhatsApp (WP-27, ADR-023)

What it does: sends approved WhatsApp templates through the Cloud API of the **tenant's own** business number, applies Meta's delivery reports, and honours every way a customer says stop. Marketing needs the customer's WhatsApp consent (the send gate); Messign does not manage templates.

## Connect a tenant

1. **In Meta** (the tenant, or you for a test): a Meta developer app with the WhatsApp product, a WhatsApp Business account and a business phone number. For testing use the **test number** Meta provides (it can message only the recipients Meta allows; see Meta's documentation for the limit). For live: a verified business and an approved display name.
2. **Collect three values** (never in chat, never in the repo): the **access token** (a system user's token, not a short-lived one), the **app secret** (App settings, Basic), and a **verify token** you invent (a random string). Also note the **phone number id** (WhatsApp, API setup).
3. **Create the account** through the API, as a tenant admin (secrets never go through the browser):
   `POST /api/engage/channel-accounts` with `{"channel":"whatsapp","provider":"whatsapp_cloud","mode":"test","label":"whatsapp","config":{"phone_number_id":"<id>","default_language":"tr"},"secrets":{"access_token":"…","app_secret":"…","verify_token":"…"}}`. The response carries the account id. Use mode `live` only for a verified number.
4. **Point Meta's webhook at it:** App Dashboard > WhatsApp > Configuration: Callback URL `https://<api host>/api/engage/webhooks/<account id>` and the verify token. Meta then sends the handshake (a GET); if it saves, subscribe to the fields **`messages`** (delivery statuses and what customers write) and **`user_preferences`** (a customer stopping or resuming marketing messages). Changing the callback URL or the token sends the handshake again.
5. **Templates:** create them in WhatsApp Manager (category Marketing or Utility), wait for Meta to approve them, and use the exact name (lower-case letters, digits, underscores) and language. A message's content is `{"template":"cart_reminder","language":"tr","body_parameters":["Ayşe","Kitapyurdu"]}`, the variables in order ({{1}}, {{2}}). A text message (`{"text":"…"}`) only works within 24 hours of the customer's last message.
6. **Try it in the sandbox:** `SEND_MODE=sandbox`, the account in mode `test`, the recipient's number on the sandbox allow-list (`addAllowlistEntry`, as in `docs/runbooks/ses-sandbox-setup.md`), WhatsApp consent recorded with evidence, and the tenant ready (rate card and budget cap for WhatsApp). Send one message; watch its status move to delivered through the webhook.
7. **First live check, before relying on it:** with the test number, send a template, then (a) reply STOP from the phone and check the consent is revoked and the number suppressed, (b) stop marketing messages from the business with the WhatsApp app's own option and check the `user_preferences` webhook revoked it, (c) send again and see Meta answer 131050 and the message fail. The mock follows Meta's documentation, not Meta: compare, and fix `engage/whatsapp/mock` and the code together.
8. **Go live:** mode `live`, readiness items `dpa_signed` and `waba_verified` recorded, `SEND_MODE=live`.

## When something is wrong

| What you see | Meaning |
|---|---|
| Webhook handshake refused in Meta's dashboard | The verify token differs from the account's `verify_token`, or the account id in the URL is wrong or the account is disabled |
| 401 in the API logs for webhooks (`webhook rejected: signature`) | The app secret on the account is not the one of the app Meta is sending from |
| Messages fail with `wa_190` | The access token expired or was revoked: rotate the account with a new token |
| `wa_132001` / `wa_132000` | The template is not approved in that language, or the number of variables differs from the template |
| `wa_131047` | A text message outside the 24-hour window: use a template |
| `wa_131050` | The customer stopped marketing messages from you: consent is revoked automatically; do not retry |
| `wa_131049` | Meta held the marketing message back to keep the experience healthy; retrying does not guarantee delivery |
| An opt-out shows `unmatched` in `engage.inbound_events` | The customer's number is not in this tenant, or Meta sent only a business-scoped user id (customers with a WhatsApp username): it could not be applied |

Logs carry account ids, counts and error codes, never a number, a message, a token or a secret.

## Develop without Meta

`ENGAGE_WHATSAPP_GRAPH_URL=http://127.0.0.1:<port>` sends the adapter to a local mock. The mock (`engage/whatsapp/mock/mockGraphServer.ts`) is a library for tests and demos: approve templates, open a service window, stop marketing for a number, inject faults, and build Meta's webhook payloads. Sign payloads with `signBody(appSecret, body)` (`engage/whatsapp/format.ts`).
