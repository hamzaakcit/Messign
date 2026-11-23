# Part 5: WhatsApp Business account

The tenant sends through its **own** WhatsApp Business Account (WABA) and business phone number on Meta's Cloud API. Messign sends approved templates only;
it does not create or approve templates. Full technical steps for the operator: `docs/runbooks/whatsapp.md`.

## What the tenant does (weeks 1 to 4; Meta's review time is outside our control)

1. **Meta Business verification** for the company in Meta Business Settings, and a Meta developer app with the WhatsApp product (the operator can guide this; the app can be the tenant's own).
2. **A WhatsApp Business Account and a business phone number** that is not already in use on WhatsApp; an approved display name.
3. **A system user's access token** (a permanent one, not a short-lived one), the **app secret**, and a **verify token** the operator invents. These three are secrets: the tenant gives them to the operator in a password manager or types them at the operator's hidden prompt. Never by chat or email.
4. **Templates** created in WhatsApp Manager: category Marketing or Utility, numbered variables, and for marketing a quick-reply "Stop" button or a line saying how to stop. Meta approves them; the tenant waits.
5. **Customer consent for WhatsApp** is tracked separately from email. The import template has a `consent_whatsapp` column; the evidence rules are the same **[LC]**.

## What the operator does

1. Stores the account: `npm run engage:add-account -- --org <uuid> --whatsapp --mode test --label "WhatsApp" --config phone_number_id=<id> --config waba_id=<id> --ask-master-key` (mode `test` for the Meta test number, `live` only for the verified number).
2. Sets Meta's webhook callback to `https://<api host>/api/engage/webhooks/<account id>` with the verify token, and subscribes `messages`, `user_preferences` and `message_template_status_update`.
3. Settings > WhatsApp shows the checklist, the webhook URL, template status and the daily limit of new customers. Check each line is green.
4. Registers each template (how its variables are filled), runs the template check, and rehearses in sandbox to staff.
5. The tenant records `waba_verified` (and `dpa_signed`) in Settings > Readiness, with an evidence link.

State of the live checks (honest): the account, a send with its delivery report and a campaign were checked on the production API with Meta's test number in
sandbox mode (WP-27, WP-40, ADR-025). The template `messign_live_check` still awaits Meta's approval, so template approval webhooks and header and link-button values are not yet verified live.
