# Part 4: başlık and İYS

**SMS sending is not built yet** (WP-28 waits for the Alaris documentation), so this page is what the tenant starts collecting early, because the lead time is
outside Messign. İYS sync for email and WhatsApp consent is built (`docs/runbooks/iys-sync.md`). Nothing here is legal advice; every requirement below is to
be confirmed with the operator, the SMS provider and the tenant's counsel **[LC]**.

## Başlık (alphanumeric sender name for SMS)

| Item | Who | Notes |
|---|---|---|
| The sender name (başlık) is the **tenant's**, registered through the operator or its SMS provider in the tenant's name and company title | Tenant | A sender name may not use someone else's brand. Messign validates 3 to 11 characters (letters, digits, space, dot, hyphen) and refuses others |
| Documents for the application | Tenant | The operator or provider states which company documents it needs and the approval time; collect them from them, not from this page **[LC]** |
| SMS account in the tenant's name (Alaris-based platform) | Tenant with Hamza | B4 in the roadmap. Not Messign's account |
| Domestic route for SMS with links | Provider | Operators block A2P SMS with URLs sent from abroad to Turkish subscribers, so a cart-abandonment SMS needs a domestic, licensed route. Messign flags routes with `domestic_tr` |
| Record in Settings > Readiness | Tenant admin | Item `sms` / `btk_sender_id`: the approved sender name, the date, an evidence link |

## İYS (the commercial message management system)

| Item | Who | Notes |
|---|---|---|
| İYS registration of the tenant as service provider | Tenant | Its own e-Devlet-authorised user creates it **[LC]** |
| İYS number (`iysCode`) and brand number (`brandCode`) | Tenant | Record in Settings > Readiness: `sms` / `iys_brand_code` (and keep for the İYS account in Messign) |
| İYS API access (test first, live after İYS's own contract steps) | Tenant | B5. Stored as the tenant's own İYS account by an operator: `docs/runbooks/iys-sync.md`. Messign is not an İYS integrator, and whether it counts as an intermediary is **[LC]** |
| Consent export from İYS (and the tenant's own consent records) | Tenant | B2. Imported consent is recorded as source `import`, not as İYS consent; İYS state arrives through the pull |
| IP address registration | Operator with İYS | İYS may require the server's outbound address to be registered; ask İYS how, and note that its rate limits are per address, shared by every tenant on one server |

What the technical control does: with the İYS account connected, an opt-out is reported to İYS the same day and what a recipient does in İYS is pulled in
before the next send; the sync health shows in Settings. The legal deadlines and their meaning are the tenant's and counsel's **[LC]**.
