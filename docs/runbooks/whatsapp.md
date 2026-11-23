# Runbook: WhatsApp (WP-27, ADR-023; WP-40, ADR-025)

What it does: sends approved WhatsApp templates through the Cloud API of the **tenant's own** business number, applies Meta's delivery reports, and honours every way a customer says stop. Marketing needs the customer's WhatsApp consent (the send gate); Messign does not manage templates.

## Connect a tenant

1. **In Meta** (the tenant, or you for a test): a Meta developer app with the WhatsApp product, a WhatsApp Business account and a business phone number. For testing use the **test number** Meta provides (it can message only the recipients Meta allows; see Meta's documentation for the limit). For live: a verified business and an approved display name.
2. **Collect three values** (never in chat, never in the repo): the **access token** (a system user's token, not a short-lived one), the **app secret** (App settings, Basic), and a **verify token** you invent (a random string). Also note the **phone number id** (WhatsApp, API setup).
3. **Create the account** through the API, as a tenant admin (secrets never go through the browser):
   From a terminal (WP-40c; the token, app secret and verify token are asked at hidden prompts):
   `npm run engage:add-account -- --org <org id> --whatsapp --mode test --label "WhatsApp" --config phone_number_id=<id> --config waba_id=<WhatsApp Business Account id> --config daily_recipient_limit=250 --ask-master-key`. `--whatsapp` sets the channel, the provider and the three secrets; ids stay text (Meta's 16- and 17-digit ids would lose digits as numbers). It warns, without refusing, when `phone_number_id` or `waba_id` is missing.
   Or through the API, as a tenant admin: `POST /api/engage/channel-accounts` with `{"channel":"whatsapp","provider":"whatsapp_cloud","mode":"test","label":"whatsapp","config":{"phone_number_id":"<id>","waba_id":"<WhatsApp Business Account id>","daily_recipient_limit":250,"default_language":"tr"},"secrets":{"access_token":"…","app_secret":"…","verify_token":"…"}}`. The response carries the account id. Use mode `live` only for a verified number.
4. **Point Meta's webhook at it:** App Dashboard > WhatsApp > Configuration: Callback URL `https://<api host>/api/engage/webhooks/<account id>` (Settings > WhatsApp shows it in full, with a Copy button, once `ENGAGE_PUBLIC_API_URL` is set on the server) and the verify token. Meta then sends the handshake (a GET); if it saves, subscribe to the fields **`messages`** (delivery statuses and what customers write), **`user_preferences`** (a customer stopping or resuming marketing messages) and **`message_template_status_update`** (Meta approving, pausing or disabling a template; WP-40a). Changing the callback URL or the token sends the handshake again.
5. **Templates (WP-40a, ADR-025):** create them in WhatsApp Manager (category Marketing or Utility, numbered variables `{{1}}`, `{{2}}`; for marketing, a quick-reply "Stop" button or a line saying how to stop), and wait for Meta to approve them. Then:
   - **Account config:** `waba_id` (the WhatsApp Business Account id) is required for the template check and the status webhook; `daily_recipient_limit` is the tier shown in WhatsApp Manager (250 at the start, then 2,000, 10,000, 100,000). Until it is set the gate assumes 250 and defers a new customer beyond it to the next window. Raise it when Meta raises the tier.
   - **Check:** `POST /api/engage/whatsapp/templates/check` (admin) reads every template from Meta now; it also runs hourly. `GET /api/engage/whatsapp/templates` shows each one's status, category and quality, which Messign template fills it, and registrations Meta does not know (a typo in the name or language).
   - **Register how to fill it:** `POST /api/engage/templates` with `{"channel":"whatsapp","key":"cart-wa","name":"Cart on WhatsApp","content":{"metaName":"cart_reminder","language":"tr","declaredCategory":"marketing","optOut":"quick_reply","bodyText":"Merhaba {{1}}, sepetinde {{2}} seni bekliyor.","variables":[{"source":"attribute","name":"first_name","defaultValue":"merhaba"},{"source":"payload","name":"book"}],"urlButton":{"baseUrl":"https://shop.example.com/cart/","variable":{"source":"payload","name":"cart_id"}}}}`. Paste the body exactly as Meta shows it; each variable comes from a customer field (`attribute`), a trigger value (`payload`) or `sender_name` (`system`). `GET /api/engage/templates/<id>` shows whether it is sendable and why not.
   - **In the app (WP-40b):** Templates > New template > channel WhatsApp: pick the template from those Meta lists (after a check), and say where each `{{n}}` comes from. Journeys: a message step's channel WhatsApp, or the "WhatsApp, else email" preset (WhatsApp when `reachable.whatsapp`, email otherwise). Campaigns: choose a WhatsApp template. Customers: "Add customer" records WhatsApp consent with a note of where they agreed.
   - A journey with a WhatsApp step can be saved while Meta reviews the template, but not activated until Meta has approved it (in live mode, until a check has seen it).
   - A hand-built message's content is still `{"template":"cart_reminder","language":"tr","body_parameters":["Ayşe","Kitapyurdu"]}` (plus `header_parameter`, `url_button_parameter`). A text message (`{"text":"…"}`) only works within 24 hours of the customer's last message.
6. **Try it in the sandbox:** `SEND_MODE=sandbox`, the account in mode `test`, the recipient's number on the sandbox allow-list (`addAllowlistEntry`, as in `docs/runbooks/ses-sandbox-setup.md`), WhatsApp consent recorded with evidence, and the tenant ready (rate card and budget cap for WhatsApp). Send one message; watch its status move to delivered through the webhook.
7. **First live check, before relying on it:** with the test number, send a template, then (a) reply STOP from the phone and check the consent is revoked and the number suppressed, (b) stop marketing messages from the business with the WhatsApp app's own option and check the `user_preferences` webhook revoked it, (c) send again and see Meta answer 131050 and the message fail. The mock follows Meta's documentation, not Meta: compare, and fix `engage/whatsapp/mock` and the code together.
8. **Go live:** mode `live`, readiness items `dpa_signed` and `waba_verified` recorded, `SEND_MODE=live`.

## Operate it (WP-40c)

**Settings > WhatsApp** (tenant admins; `GET /api/engage/whatsapp/setup`) shows, from what the server already keeps and without calling Meta:
- the checklist: account added, `waba_id` set, webhook URL available, template check working, templates in use approved, ready to send (each with what to do when it is not);
- the webhook URL to paste into Meta, the three fields to subscribe, the last delivery report and the last template update Meta sent (none yet means the webhook or the app's subscription to the WhatsApp Business Account is missing, step 3b below);
- the template check: the last success, the last failure in words (`wa_190` token, `wa_10`/`wa_200` permission, `wa_100` wrong `waba_id`, `waba_missing`) and **Check now**. The check is also the token check: it reads the templates with the account's token;
- the daily limit: customers messaged in 24 hours against `daily_recipient_limit` (or Meta's starting 250 when the account does not say), and messages waiting for room;
- the templates in use (an active journey sends it, or messages used it in the last 7 days) with Meta's status and quality.

**Alerts** (on Settings under "Needs attention" and to the operators, `docs/runbooks/ops-monitoring.md`):

| Alert | When | What to do |
|---|---|---|
| `whatsapp_template_unhealthy` | A template in use is paused, disabled, rejected or deleted at Meta (critical: its messages are refused), or rated red (warning) | Fix or replace it in WhatsApp Manager; the webhook or the next hourly check clears it |
| `whatsapp_template_check_failing` | The template check failed 3 times in a row | The code says why (above); until it works, only the webhook keeps the statuses fresh |
| `whatsapp_frequency_limited` | Meta held back at least 10% (and at least 5) of 20 or more WhatsApp messages in 24 hours with 131049 | Send marketing less often or make it more relevant; retrying does not help; the customers are not opted out |
| `whatsapp_pacing_holding` | A message has waited over a day for the account's daily limit | If WhatsApp Manager shows a higher limit, rotate the account with the new `daily_recipient_limit`; otherwise send smaller campaigns |

## Live check with your own Meta test number

Run it once before relying on the channel. It uses the real pipeline in `SEND_MODE=sandbox` (forced by the script, never live) and a test-mode account. The number you give is yours and is never printed. Run the commands from `server/` with `DOTENV_CONFIG_PATH=/path/to/server/.env` in front, as for the other operator scripts.

**In Meta (you; the dashboard flow as of 2026-11-22):**
1. In the Meta App Dashboard open your app, then the use case **Connect with customers through WhatsApp**, then **Step 1. Try it out**. The first time, Meta asks you to accept its WhatsApp terms and creates a **test number** and a test business account in your business portfolio. Note the test number's **Phone number ID** (shown on that page).
2. On the same page, in the **To** list, add **your own WhatsApp number** as a recipient (a test number can message at most 5 numbers; Meta sends a code to verify the number).
3. **Generate token** on the same page: a temporary access token, enough for the check (it lasts about a day; use a system user's permanent token later, see Meta's "Get started" page). Copy it somewhere only you can see.
4. **App settings > Basic > App secret**: show and copy it.
5. Invent a **verify token** (any long random string).

**In your terminal:**
1. A tenant, if you have none yet: `npm run engage:provision -- --name "Demo Kitap" --slug demo-kitap --admin-email <you> --admin-name "Demo Admin"` (prints the organization id).
2. The account (the secrets are typed at hidden prompts; so are the production master key and its id):
   `npm run engage:add-account -- --org <org id> --channel whatsapp --provider whatsapp_cloud --mode test --label "WhatsApp test number" --config phone_number_id=<Phone number ID> --config api_version=v25.0 --config default_language=en_US --secret access_token --secret app_secret --secret verify_token --ask-master-key`
   It prints the **account id**.
3. In Meta: Use cases > Customize > Webhooks (the app-level Webhooks page, object **Whatsapp Business Account**): **Callback URL** `https://<api host>/api/engage/webhooks/<account id>` and the **verify token** from step 5 (you type it; it is a secret). Meta sends the handshake as you press **Verify and save**. Then subscribe the fields **messages** and **user_preferences**.
3b. **Subscribe the app to the WhatsApp Business Account itself.** Found in the first live check: with the callback and fields set, messages went out and arrived but **no delivery report reached the server**, because only Meta's own test app was subscribed to the account. Run `npm run engage:whatsapp-check -- --org <org id> --account <account id> --webhooks --waba <WhatsApp Business Account id> --subscribe --ask-master-key` (the account id is on the API Setup page). It lists the subscribed apps, subscribes this one through Meta's `POST /<WABA id>/subscribed_apps` and lists them again. It sends nothing and never prints the token.
4. Make the tenant ready and send one message:
   `npm run engage:whatsapp-check -- --org <org id> --account <account id> --to +90<your number> --prepare --ask-master-key`
   The message (the sample "Order Confirmation" template Meta gives a new test number, `jaspers_market_order_confirmation_v1`, with its three values) should arrive on your phone, and the script should print **DELIVERED** within a minute or two: that proves sending, the handshake, the signature and the status path against the real Meta.
5. **Reply STOP** to the message from your phone, then run the same command with `--report` instead of `--prepare`: WhatsApp consent should read `revoked`, with a ledger line `via whatsapp_stop_message` and an inbound line `text -> opt_out_applied`. Send again (without `--prepare`): the gate must block it.
6. **Stop marketing in the WhatsApp app** for the business (the app's own option), run `--report` again, and look for `preference_stop -> opt_out_applied` (or `unmatched` if Meta sent only its opaque user id instead of your number: then record that, it is the known gap in ADR-023). Optionally send a `marketing` message (`--purpose marketing`) to a number that stopped marketing and look for the Meta error `wa_131050` and the revocation.

If something fails, note the code the script prints, and the table below says what it means. Then fix `engage/whatsapp` and `engage/whatsapp/mock` together.

## Live check of templates (WP-40)

Confirms against the real Meta what WP-40 built from the documentation. Run from `server/` with `DOTENV_CONFIG_PATH=/path/to/server/.env` in front, on the test-mode account of the WP-27 check. Sends only to your own number, in sandbox.

1. **Database:** migration 137 applied (`npm run db:migrate` with `DATABASE_MIGRATE_URL`).
2. **In Meta:** on the API Setup page generate a new access token (a temporary one lasts about a day) and note the **WhatsApp Business Account ID**. Under the app's Webhooks (object *Whatsapp Business Account*) subscribe **`message_template_status_update`** next to `messages` and `user_preferences`. In WhatsApp Manager > Message templates, create a **Marketing** template in **Turkish** named `messign_live_check`: a **text header** with one variable (`Ekim {{1}}`), body `Merhaba {{1}}, bu Messign canlı kontrol mesajıdır.`, a **Quick reply** button `Durdur` and a **Visit website** button with a dynamic URL `https://example.com/{{1}}`. Submit it.
3. **Rotate the account** with the new token and the WhatsApp Business Account id: `npm run engage:whatsapp-check -- --org <org> --account <account> --rotate --config waba_id=<WABA id> --ask-master-key`. Use the printed new account id from now on.
4. **Template check:** `... --org <org> --account <new account> --templates --ask-master-key`. Verifies the listing permission and field names: it should print `OK` and every template with its status, category and shape (the new one `PENDING`, its header `TEXT with 1 variable`, `URL-button variables 1`, buttons `[QUICK_REPLY, URL]`).
5. **Status webhook:** once Meta has reviewed the template (minutes), run `--templates` again: an `event: messign_live_check (tr) APPROVED via webhook` line proves Meta's template webhook reaches the server and is applied.
6. **Header and URL-button send:** `... --to +90<your number> --prepare --template messign_live_check --language tr --purpose marketing --param Ayşe --header-param 2026 --button-param live-check --ask-master-key`. It should print DELIVERED; on the phone the header reads `Ekim 2026` and the button opens `https://example.com/live-check`.
7. **Marketing stops (optional, now possible with a marketing template):** stop marketing messages from the business with the WhatsApp app's own option, then `--report` (look for `preference_stop -> opt_out_applied`), and send step 6 again: the gate blocks it; with consent restored by hand, Meta answers `wa_131050`.

Record each result in ADR-025 as verified or not verified.

## When something is wrong

| What you see | Meaning |
|---|---|
| Webhook handshake refused in Meta's dashboard | The verify token differs from the account's `verify_token`, or the account id in the URL is wrong, or the account was disabled and has no active replacement |
| 401 in the API logs for webhooks (`webhook rejected: signature`) | The app secret on the account is not the one of the app Meta is sending from |
| Messages fail with `wa_190` | The access token expired or was revoked: rotate the account with a new token. The webhook URL in Meta's dashboard stays valid: it follows the rotated account, so nothing changes there (a new `app_secret` or `verify_token` only has to be part of the rotation) |
| `wa_132001` / `wa_132000` | The template is not approved in that language, or the number of variables differs from the template |
| `wa_131047` | A text message outside the 24-hour window: use a template |
| `wa_131050` | The customer stopped marketing messages from you: consent is revoked automatically; do not retry |
| `wa_131049` | Meta held the marketing message back to keep the experience healthy; retrying does not guarantee delivery. Not an opt-out: the customer is not suppressed |
| Blocked `template_not_approved` | Meta's status for the template is not APPROVED (pending, rejected, paused, disabled, deleted). Fix it in WhatsApp Manager; the status webhook or the next check (hourly) clears it |
| Blocked `template_status_unknown` (live only) | Messign has never seen the template at Meta: run the template check; check `waba_id` and the name and language of the registration |
| Blocked `template_mapping_mismatch` | The values do not fit the template Meta approved (count of body, header or button values; or a media header or a button type Messign cannot fill). Register a new version that matches |
| Blocked `template_category_mismatch` | A marketing template was sent as transactional. Meta's category decides; use a utility template for transactional messages |
| Deferred `account_pacing` | The account reached its `daily_recipient_limit` of new customers in 24 hours; the message waits for the window. If Meta has raised the tier, raise the config |
| Blocked `account_limit_reached` | Same limit, but the message would expire before there was room. Raise the limit if Meta has, or send in smaller batches |
| Template check `waba_missing` / `wa_190` / `wa_200` | No `waba_id` on the account / the token is refused / the token may not read templates (needs the WhatsApp business management permission) |
| An opt-out shows `unmatched` in `engage.inbound_events` | The customer's number is not in this tenant, or Meta sent only a business-scoped user id (customers with a WhatsApp username): it could not be applied |

Logs carry account ids, counts and error codes, never a number, a message, a token or a secret.

## Develop without Meta

`ENGAGE_WHATSAPP_GRAPH_URL=http://127.0.0.1:<port>` sends the adapter to a local mock. The mock (`engage/whatsapp/mock/mockGraphServer.ts`) is a library for tests and demos: approve templates, open a service window, stop marketing for a number, inject faults, and build Meta's webhook payloads. Sign payloads with `signBody(appSecret, body)` (`engage/whatsapp/format.ts`).
