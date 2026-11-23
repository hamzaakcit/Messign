# Part 3: DNS records and the email account

Email is the pilot channel. The tenant sends from **its own domain, on a sending subdomain** (for example `mail.<shop domain>`), through its own
Amazon SES account. Messign never sends from its own domain.

## Records the tenant adds

All values come from the tenant's SES identity page; the table shows the shape, not the values. Replace `mail.example-shop.com` with the real subdomain.

| Record | Name | Type | Value | Notes |
|---|---|---|---|---|
| SPF | `mail.example-shop.com` | TXT | one record starting `v=spf1`, including the ESP's include | Exactly **one** SPF record at that name; two records fail the check (`spf_multiple`) |
| DKIM | `<selector>._domainkey.mail.example-shop.com` | CNAME (or TXT) | the target SES shows | SES gives three selectors; name them in Settings > Email domain (up to 5) |
| DMARC | `_dmarc.mail.example-shop.com` | TXT | `v=DMARC1; p=none; rua=mailto:<tenant mailbox>` to start | Exactly one record with a valid `p=`. The tenant chooses the policy and tightens it later **[LC]** for the effects on their other mail. The record must sit on the From domain itself: a DMARC record only on the parent domain fails the check, so use the same name for From, or send from the parent domain |

Messign's check (Settings > Email domain, then about daily) only looks DNS up. It does not prove that SES may send for the domain (that is SES's own
verification), and it does not follow SPF includes. A pass sets `email_domain_authenticated`; a pass older than 30 days stops counting in live mode; a record that is really gone removes it
and the tenant sees "email domain lost" under Needs attention.

## The SES side (the tenant)

Follow `docs/runbooks/ses-sandbox-setup.md` section 1: verify the sender identity, create a send-only IAM user and key, create the SNS topic for
delivery reports. Production access (leaving the SES sandbox) is requested by the tenant from AWS **before** the pilot's Phase B; Phase A, to staff, can run in the SES sandbox with verified inboxes.

## The email account in Messign (the operator)

From the operator's terminal, with the production `ENGAGE_DATABASE_URL`, and the master key typed at a hidden prompt:

```bash
npm run engage:add-account -- --org <tenant org uuid> --channel email --provider ses --mode test --label "SES" \
  --config region=eu-central-1 --config from_address=hello@mail.example-shop.com --config from_name="<the sender name, exactly>" \
  --config sns_topic_arn=arn:aws:sns:eu-central-1:<account-id>:<topic> \
  --secret access_key_id --secret secret_access_key --ask-master-key
```

- **`from_name` must equal the tenant's sender name** (Settings > Sender name). The gate compares the two after trimming and collapsing spaces, case-sensitively; a difference denies every message with `sender_identity_mismatch`. If either side is empty there is no mismatch (the message carries no name), but a template signed with `{{sender_name}}` is then refused to render: set both.
- `--mode test` for sandbox, `--mode live` for the pilot environment. One active email account per tenant.
- To change the From name later, rotate the account with the new `config.from_name` (the webhook URL keeps working).
- The tenant never types an access key into the browser.

Then point the SNS subscription at `https://<api host>/api/engage/webhooks/<account id>` (runbook section 2.4), set `ENGAGE_PUBLIC_APP_URL` and
`ENGAGE_PUBLIC_API_URL` in Railway (unsubscribe links), and record both in the checklist.
