# Multi-number WhatsApp contract (gateway <-> platform UI)

One gateway process runs one WhatsApp client per ACCOUNT. An account = one WhatsApp number, usually one brand.

## Selecting an account
Every `/api/*` call that touches CRM data takes the account from, in order:
1. header `X-WA-Account: <id>`
2. query `?account=<id>`
3. default: the lowest account id (so the old single-number UI, event pages and curl keep working unchanged).
An unknown id returns 404 `{error}`.

## Accounts API (admin / bearer only)
- `GET  /api/accounts` -> `[{id, name, client_id, status, phone, wa_name, since, error, is_default}]`
  - `status`: starting | qr | loading | ready | disconnected | error | stopped
  - `client_id`: id of the platform client (brand) this number belongs to, or null. The gateway stores it; it does not validate it.
  - never includes QR data or session paths.
- `POST /api/accounts` `{name, client_id?}` -> the new account. Starts its client (QR state). Refused with 409 `{error, code:"max_accounts"}` beyond env `MAX_ACCOUNTS` (default 3).
- `PATCH /api/accounts/:id` `{name?, client_id?}` -> account
- `GET  /api/accounts/:id/status` -> `{id, status, qr (data URL or null), me:{phone,name}|null, error, since}`
- `POST /api/accounts/:id/restart` -> `{ok:true}` (reconnect)
- `POST /api/accounts/:id/logout` -> `{ok:true}` (unlink, then back to QR)
- `DELETE /api/accounts/:id` -> `{ok:true}`; refused with 409 for the default account or an account that has contacts/messages unless `?force=1`. Stops the client and removes its session folder.
- `GET /api/wa/status` keeps working and reports the selected account in its old shape.

## Scoping
Contacts, contact tags, messages, templates, campaigns and campaign items belong to one account. The same phone number may exist as a contact in several accounts with different names and tags. Counts, searches, tags lists, imports, sends and polling are all per account. Event-day features (attendees, seats, check-in, public pages) stay bound to the DEFAULT account.

## Migration (must be automatic and safe)
On startup, a database without accounts gets account 1 named "Nuralive" (client_id null) and every existing row is assigned to it. Account 1 keeps the EXISTING WhatsApp session folder, so no QR re-scan is needed. New accounts use a distinct session folder per id.
