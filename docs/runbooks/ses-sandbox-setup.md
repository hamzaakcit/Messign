# Connecting an Amazon SES sandbox account (WP-12, D-05)

The email channel is built and tested against a faked SES. To send for real you create the AWS side yourself (Messign never creates accounts) and store it as an engage channel account. In SES **sandbox** mode, AWS only delivers to addresses you have verified, which is what D-05 wants: real sends only to your own test inboxes.

Everything below happens in one AWS region. The examples use `eu-central-1` (Frankfurt).

## 1. AWS side

1. **Verify a sender identity.** SES console → *Identities* → *Create identity*. Use your own test domain (preferred; add the DKIM records it shows, and an SPF and DMARC record) or a single address. This becomes `from_address`.
2. **Verify each recipient.** In sandbox mode SES delivers only to verified identities. Add every test inbox you will send to (an *Email address* identity each) and click the link AWS sends.
3. **Create an SNS topic** for delivery reports, e.g. `messign-ses-events` (Standard type). Note its ARN: `arn:aws:sns:eu-central-1:<account-id>:messign-ses-events`.
4. **Point SES notifications at the topic.** On the sender identity → *Notifications* → set Bounce, Complaint and Delivery feedback to the topic. Leave "include original headers" off (Messign does not need them, and they contain addresses).
   *Alternative:* a configuration set with an SNS event destination (Send, Reject, Delivery, Bounce, Complaint, Rendering failure). Then also set `configuration_set` in step 2.2.
5. **Create an IAM user for sending only**, with this policy, and create an access key for it:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{ "Effect": "Allow", "Action": "ses:SendEmail", "Resource": "*" }]
   }
   ```
   (`Resource` can be narrowed to the identity ARN and configuration set ARN.)

## 2. Messign side

1. **Production must have migrations 116, 117 and 118 applied** (`npm run db:migrate` with the admin URL, as before).
2. **Store the account** as a tenant admin of the demo tenant, `POST /api/engage/channel-accounts`:
   ```json
   {
     "channel": "email",
     "provider": "ses",
     "mode": "test",
     "label": "SES sandbox",
     "config": {
       "region": "eu-central-1",
       "from_address": "hello@your-test-domain.example",
       "from_name": "Demo Kitap",
       "sns_topic_arn": "arn:aws:sns:eu-central-1:<account-id>:messign-ses-events"
     },
     "secrets": { "access_key_id": "AKIA…", "secret_access_key": "…" }
   }
   ```
   The response contains the account `id`. The secret is encrypted with `ENGAGE_MASTER_KEY` and never returned again.
   `mode` must be `test` for `SEND_MODE=sandbox`; the gate refuses a `live` account in sandbox and a `test` account in live.
   **No tenant-admin token handy? Use the operator script** (the secret is typed at a hidden prompt, so it never appears in shell history or chat). From `server/`, with the production `ENGAGE_DATABASE_URL`, `ENGAGE_MASTER_KEY` and `ENGAGE_MASTER_KEY_ID` in the environment (the master key MUST be the production one, or the server cannot decrypt what you store):
   ```bash
   npm run engage:add-account -- --org <org uuid> --channel email --provider ses --mode test --label "SES sandbox" \
     --config region=eu-central-1 --config from_address=hello@messign.com --config from_name="Demo Kitap" \
     --config sns_topic_arn=arn:aws:sns:eu-central-1:<account-id>:messign-ses-events \
     --secret access_key_id --secret secret_access_key
   ```
   It prints the account id and the webhook path. To load variables from another `.env`: `DOTENV_CONFIG_PATH=/path/to/server/.env npm run engage:add-account -- ...`
3. **Subscribe the webhook.** SNS console → the topic → *Create subscription* → protocol **HTTPS**, endpoint:
   `https://<your-railway-host>/api/engage/webhooks/<account id>`
   Messign verifies SNS's signed confirmation message and confirms the subscription by itself; the subscription shows *Confirmed* within seconds. If it stays *Pending*, check that the topic ARN in the account config matches exactly (anything from another topic is refused with 401).
4. **Gate configuration for the tenant** (no UI until WP-22):
   - `send_enabled`: `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = '<org>';` (admin SQL)
   - an email rate card per purpose and a monthly cap, via `addRateCard` / `setBudgetCap` (or SQL into `engage.rate_cards` / `engage.budget_caps`);
   - each recipient on the sandbox allow-list (`addAllowlistEntry`), matching the addresses verified in step 1.2.
5. **Set `SEND_MODE=sandbox`** on the server. Off is the default; live is not for this account.

## 3. What happens then

- A dispatched message goes through the send gate (consent, suppression, allow-list, budget, content), then to SES. The SES `MessageId` is stored on the message.
- SES publishes Delivery, Bounce and Complaint to the topic; SNS posts them to the webhook. A hard bounce or a complaint suppresses the address for that tenant immediately, so the gate denies the next send to it.
- Webhook responses: 200 verified, 401 bad signature or wrong topic, 404 unknown or disabled account, 503 cannot fetch AWS's signing certificate right now (SNS retries).

## Limits and honest notes

- SES has no idempotency key. If the server dies after SES accepted a message but before Messign recorded it, the retry can send the email twice.
- A soft bounce is reported by SES only when it has given up; the message is marked failed and the address is **not** suppressed.
- `List-Unsubscribe` headers are not set yet (WP-13).
- Nothing here has been run against real AWS. The request format and the SNS signature scheme follow the AWS documentation (cited in `server/src/engage/messaging/sesAdapter.ts`), and request signing matches AWS's published SigV4 test vector, but the first real send is the first end-to-end proof.
