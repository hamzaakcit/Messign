# Send one email to a segment now (campaigns, ADR-018)

On the Lucy page: **Campaigns** tab, or the **Send an email now** button in the CMO column. An admin of the organization sends; any user of the organization reads.

## Send

1. Have a template (**Templates**) with an unsubscribe link (the starter has one) and a segment (**Segments**).
2. **Send an email now**: name it, choose the template and the segment, optionally hold back a share of customers (0 to 50%).
3. **Check who would receive it**. You see the template and its subject, how many customers are in the segment, and how many of them have email consent (only those receive it). You also see whether sending is ready, and if not, why.
4. Tick the confirmation and press **Send now to N customers**. The campaign opens with its progress and, as messages go through the send gate, its results: delivered, blocked and why.

Pressing Send twice, or retrying after an error, is the same campaign: it sends nothing twice. If the page was closed while a large audience was being added, the campaign shows **Finish sending**.

## When it says sending is not ready

A campaign is refused before anything is written, with every reason. Each reason has one fix, for now done by an operator (the settings screen is WP-22):

| Reason | Fix |
|---|---|
| Sending is switched off on this server | Set `SEND_MODE=sandbox` (or `live`) on the server and restart. Off is the default. |
| Sending is not enabled for this organization | `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = '<org>';` (admin SQL) |
| No email sending account is set up | `npm run engage:add-account` (see `ses-sandbox-setup.md`, step 2) |
| More than one email sending account is active | Disable all but one (an enrollment with two accounts fails rather than guess). |
| The email account is in test mode, but sending runs live (or the reverse) | Sandbox needs a `test` account, live needs a `live` account. |
| No email rate card, or no monthly budget cap | Add them (`addRateCard`, `setBudgetCap`, see `ses-sandbox-setup.md`): the gate blocks every message without them. |
| Unsubscribe links cannot be built | Set `ENGAGE_PUBLIC_APP_URL` (where the web app is served) and `ENGAGE_PUBLIC_API_URL` (where this API is reachable) to https URLs on the server. Without them no marketing message can be created. |
| Readiness items not recorded yet (live only) | Record `dpa_signed` and `email_domain_authenticated` for the organization. |

In **sandbox** mode only addresses on the sandbox allow-list receive the email; the others show as blocked (`not_allowlisted`). That is the safe way to try a campaign.

## What the results mean

- **Customers with consent** is how many were added to the campaign. Customers without email consent are left out and are not listed as blocked.
- Messages are **delivered**, or **blocked** by the send gate (suppressed address, not on the allow-list, quiet hours deferral, frequency cap, budget). The customer's page shows each decision and the consent in force at that moment.
- A campaign that ended early says why (the journey was stopped, or the segment version could not be found).

## For operators

- A campaign is a one-step journey (key `campaign-<hash>`), approved and activated by the admin who pressed Send. It does not appear in the Journeys list.
- Interrupted sends are finished with `POST /api/engage/campaigns/:id/resume` (the **Finish sending** button).
- A server without the job queue (`ENABLE_PG_BOSS=false`) does not turn enrollments into messages by itself: the scheduled tick does. Run the tick (or use a server with the queue) for the messages to be created and sent.
