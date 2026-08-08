# Boss Board Worker

Tiny Cloudflare Worker API for the Boss Signup Planner shared board.

## Deploy

1. Log in:

```bash
npx wrangler login
```

2. Create KV:

```bash
npx wrangler kv namespace create BOSS_BOARD
```

3. Copy `wrangler.toml.example` to `wrangler.toml` and paste the returned KV namespace `id`.

4. Deploy:

```bash
npx wrangler deploy
```

5. Set `window.MSM_BOSS_BOARD_API` in `assets/js/boss-board-config.js` to the deployed `/current` endpoint.

The browser calls:

- `GET /current` to load the shared board.
- `PUT /current` with `{ "board": ... }` to save it.

Each save applies a rolling 30-day KV expiration. Active board sessions extend their expiry on every save; inactive sessions purge automatically after 30 days.
