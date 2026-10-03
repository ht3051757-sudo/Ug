# UGPHONE MOD

## Registration/login
This build does **not** require Supabase just to register or log in on the same browser/device.
If `config.js` is empty, the site uses local browser storage and does not show the old
"Hãy điền UG_SUPABASE_URL..." error.

## Shared backend
For shared accounts, Admin, BAN, chat, keys and realtime, fill `ug/config.js` with your own
Supabase Project URL and Publishable/Anon key, then run `supabase_schema.sql` in Supabase SQL Editor.
Do not put a `service_role`/secret key in frontend code.

## Important
Local accounts are browser-local and are not visible to other devices. GitHub Pages cannot
provide a shared database by itself.
