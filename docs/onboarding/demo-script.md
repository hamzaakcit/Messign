# Part 7: demo script on the synthetic tenants

A 25-minute demo for a prospect (Kitapyurdu-like bookstore, Lilyana-like florist). **Nothing real is sent and the prospect does nothing**: the data is synthetic
(`@example.com` addresses and `+90 5000 xxxxxx` numbers), the email account is the mock provider, and the server runs in `SEND_MODE=sandbox`. Say that at the
start. Run it on a **development or scratch environment, not on a tenant's data**.

## Before the demo (10 minutes, operator terminal, from `server/`)

```bash
# 1. A demo tenant (prints the organization id and a one-time password in your terminal only)
npm run engage:provision -- --name "Demo Kitap" --slug demo-kitap --admin-email you@example.com --admin-name "Demo Admin"
# 2. Synthetic customers and orders (use --kind florist for the florist demo; --clean for a file without the mess)
npm run engage:synthetic -- --kind bookstore --profiles 2000 --seed 1 --out ./synthetic/bookstore
# 3. Import, dry run first, then for real: profiles before orders
npm run engage:import -- --org <org uuid> --kind profiles --file synthetic/bookstore/profiles.csv --dry-run
npm run engage:import -- --org <org uuid> --kind profiles --file synthetic/bookstore/profiles.csv
npm run engage:import -- --org <org uuid> --kind orders   --file synthetic/bookstore/orders.csv
# 4. A mock email account (the secret is typed at a hidden prompt; any string)
npm run engage:add-account -- --org <org uuid> --channel email --provider mock --mode test --label "Mock email" --config from_name="Demo Kitap" --secret webhook_secret --ask-master-key
# 5. The cart-abandonment templates and a draft journey
npm run engage:simulate-carts -- --org <org uuid> --install
```

Then in the app (sign in as the demo admin, `/marketing`): Settings > Sender name = `Demo Kitap` (it **must equal the account's From name**, or every message is denied
with `sender_identity_mismatch`; that is part of the story), and a rate card and a budget cap for email. There is no screen or script for the sandbox allow-list yet (only code: `addAllowlistEntry`); the cart
simulator allow-lists its own synthetic customers, and the imported customers are not on it, so the demo shows them blocked as `not_allowlisted`, which is the point.
Set `SEND_MODE=sandbox` on the server and `ENGAGE_PUBLIC_APP_URL` and `ENGAGE_PUBLIC_API_URL` (unsubscribe links).

## The story

| Minutes | Show | Say |
|---|---|---|
| 0 to 3 | Settings: the Sending card refusing to turn on, listing exactly what is missing | "Sending starts off and cannot be turned on until the checklist is clear. This list is the onboarding checklist." |
| 3 to 7 | Customers: the imported list, one customer's page with consent and evidence | "Consent comes in with a date and a proof reference, or it is skipped and reported. The import told us line by line what it could not use." |
| 7 to 10 | Segments and Templates: "customers with email consent who bought in the last 90 days"; a template with the unsubscribe link and the sender name | "The AI may draft copy; it never sees a customer's data and it never sends. A person approves." |
| 10 to 15 | Journeys: the cart-abandonment journey, approve and activate; `npm run engage:simulate-carts -- --org <uuid> --carts 40 --dispatch` | "Each trigger carries an idempotency key; a retry or a duplicate does not send twice." |
| 15 to 19 | A customer's trail: each message with the gate's decision, the consent in force, the journey version and the approver; a blocked customer and why | "Every message is traceable to a decision. Customers who are not on the sandbox allow-list, or have no consent, or are suppressed, were never sent to." |
| 19 to 22 | Open an unsubscribe link from a message, confirm; show the next message to that customer blocked | "Opt-out is instant, stricter than the legal deadline." |
| 22 to 25 | **Turn sending off** in Settings, trigger another cart: held, nothing sent; turn it on: it goes out once | "This is the kill switch. We time it before every pilot." |

## After the demo

- Say what is **not** in the product yet: SMS (waits for the operator's documents), erasure and export tooling (WP-35), real-time cart events from the shop's own site unless it integrates (B8).
- Say what the tenant needs to do next: `onboarding-checklist.md`, and the paperwork that sets the date (`tenant-agreements.md`, `sms-baslik-iys.md`).
- Do not describe any of this as compliant with any law; the agreements and the classification of messages are for the tenant's and Messign's advisers **[LC]**.
