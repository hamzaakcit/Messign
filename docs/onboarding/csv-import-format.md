# CSV import format (profiles and orders)

What a tenant hands over at business start. Upload as `POST /api/engage/imports?kind=profiles|orders` (tenant admin,
`Content-Type: text/csv`, up to 25 MB, add `&dry_run=1` to check a file without writing anything), or an operator runs
`npm run engage:import -- --org <uuid> --kind profiles --file profiles.csv [--dry-run]`.
Poll `GET /api/engage/imports/:id` for the outcome. Send profiles before orders.

General: UTF-8, first row is the header (column names are case-insensitive), `,` or `;` as separator, quotes for values
that contain the separator. Re-importing the same file is safe. Problems are listed by **line, column and code**, never by
value, and a bad row never stops the file.

## profiles.csv

| Column | Required | Notes |
|---|---|---|
| `external_id` | yes | Your own customer id, up to 200 characters. A repeated id is merged: later non-empty values win. |
| `email` | no | Lower-cased and trimmed. Invalid, or already owned by another profile: reported, profile still imported without it. |
| `phone` | no | Stored as E.164. Turkish forms (`0532…`, `532…`, `90532…`, `+90…`) default to +90. Others need `+` or `00`. |
| `locale`, `timezone` | no | Kept as given. |
| `consent_email`, `consent_sms`, `consent_whatsapp`, `consent_call` | no | `granted` or `revoked` (also yes/no, evet/hayır, 1/0). Empty means "no statement" and records nothing. |
| `consent_recorded_at` | for grants | `YYYY-MM-DD` or ISO timestamp, not in the future. When the customer gave consent. |
| `consent_evidence_ref` | for grants | Where the proof lives (form name and version, ticket, export file). Free text up to 300 characters. |
| `consent_ip` | no | Stored with the evidence. |
| any other column | no | Becomes a profile attribute (`lower_snake_case` name, up to 40 characters; value up to 500). Up to 60 columns. |

A grant without a date and an evidence reference is **skipped and reported**; the profile is still imported. Revocations need
no evidence. Imported revocations remove marketing consent but do not by themselves suppress the address.
Imported consent is recorded with source `import`; it is not İYS consent.

## orders.csv

| Column | Required | Notes |
|---|---|---|
| `order_id` | yes | Unique per tenant; the same id is imported once. |
| `external_id` | yes | The customer; the profile must already exist. |
| `ordered_at` | yes | `YYYY-MM-DD` or ISO. Not in the future and not older than 399 days (the event window): older rows are reported and skipped. |
| `total` | yes | `129.90` or `129,90`. |
| `currency` | no | 3 letters, default `TRY`. |
| `product_ids` | no | Separated by `\|`, up to 50. |

Orders are stored as `order_completed` events with `source: import`. Back-filled history never starts a journey.

## Synthetic tenants

`npm run engage:synthetic -- --kind bookstore|florist --profiles 100000 --seed 1 --out ./synthetic/bookstore` writes
`profiles.csv` and `orders.csv` in this format, including deliberate mess (duplicates, bad values, shared emails, grants
without evidence). Emails are only `@example.com|org|net`; phones are only `+90 5000 xxxxxx`, a range chosen by us as unlikely
to be assigned, **not** an official reservation. Add `--clean` for a file without the mess.
