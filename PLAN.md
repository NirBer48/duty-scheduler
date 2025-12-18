## Goal
Add email/password auth and per-user data isolation on the shared instance; keep Dockerized deployment flow.

## Steps
1) Backend auth & schema
   - Add `users` table (id, email unique, password_hash, created_at).
   - Auth routes: register/login/logout/me; httpOnly cookie with signed token.
   - Add `userId` to user-owned tables (people, posts, assignments, bw_assignments, es_assignments, constraints, shift_overrides if needed).
   - Enforce userId scoping in all queries/inserts (set from session; ignore client-sent userId).
   - Data migration: seed first admin user; attach existing rows to that userId.

2) Client auth flow
   - Add login/register screens; gate main app until authenticated.
   - Fetch `/auth/me` on load; handle logout and 401 redirect to login.
   - Include credentials (cookie) on requests.

3) UI tweaks
   - Show current user and logout.
   - Keep tabs; ensure data shown is scoped per user.

4) Deployment/config
   - Add env secrets (auth secret, initial admin creds).
   - Keep docker-compose; HTTPS/proxy handled externally.

