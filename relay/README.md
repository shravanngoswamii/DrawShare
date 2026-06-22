# DrawShare live relay (Cloudflare Worker + Durable Object)

A tiny WebSocket relay for live sessions: one Durable Object per session code,
fanning out messages between the host and its viewers. It stores nothing and
uses WebSocket Hibernation, so idle rooms cost no compute. SQLite-backed DO, so
it runs on the **Workers Free plan**.

## Deploy

```sh
cd relay
npm install
npx wrangler login      # opens the browser to authorize your Cloudflare account
npx wrangler deploy
```

`wrangler deploy` prints the URL, e.g. `https://drawshare.<you>.workers.dev`.

Then point the app at it by setting the build-time env var to the **wss://** form:

```
VITE_LIVE_RELAY_URL=wss://drawshare.<you>.workers.dev
```

- Local dev: put that line in `../.env.local`.
- Production: add `VITE_LIVE_RELAY_URL` as a GitHub Actions **variable** (the
  deploy workflow already reads `vars.VITE_LIVE_RELAY_URL`) and re-run the deploy.

If the var is unset, the live-session feature is simply hidden.

## Security model

- **No secrets.** The worker holds no API keys or tokens, and none are needed.
  Nothing sensitive lives in this repo. `VITE_LIVE_RELAY_URL` is a public URL
  (it ships in the client bundle), so keep it as a GitHub *variable*, not a
  secret.
- **The session code is the access control.** Anyone with a room's code can
  join it, so treat the code like a shared password. Codes are random 6-char
  strings; sessions are ephemeral and the relay stores no drawing data.
- **Origin allowlist (cost guard).** `ALLOWED_ORIGINS` in `wrangler.toml` limits
  which website origins a browser may open the relay from, so other sites can't
  run up usage on your worker. Set it to your domain; leave it empty to allow
  any origin. localhost is always allowed for development. This stops casual
  browser abuse, not a determined non-browser client — the session code remains
  the real gate. If you fork DrawShare, change `ALLOWED_ORIGINS` to your domain.
- **Connection cap.** Each room accepts at most 64 sockets, a backstop against a
  single code being used to pile up connections.
- **IP addresses.** As with any connection, Cloudflare sees client IPs to route
  traffic. The worker does not log or store them.

## Cost

Free plan covers 100k Durable Object requests/day and 13,000 GB-s/day of compute.
Incoming WebSocket messages bill 20:1 (1M received ~ 50k requests), and idle
connections hibernate (no duration billing) — so a hobby/early app stays free.
Past the free caps you'd opt into Workers Paid ($5/mo).
