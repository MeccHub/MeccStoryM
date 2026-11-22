const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const boardTtlSeconds = 60 * 60 * 24 * 30;
const maxBoardBytes = 256 * 1024; // a real board is a few KB; stops the open endpoint being used as free storage

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
      ...(init.headers || {})
    }
  });
}

function boardKey(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts.pop() || "current";
  return /^[a-z0-9-]{1,48}$/.test(id) ? `board:${id}` : null; // same format the page's sanitizeBoardId makes
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!env.BOSS_BOARD) {
      return json({ ok: false, error: "Missing BOSS_BOARD KV binding" }, { status: 500 });
    }

    const key = boardKey(request);
    if (!key) return json({ ok: false, error: "Bad board id" }, { status: 400 });

    if (request.method === "GET") {
      const stored = await env.BOSS_BOARD.get(key, "json");
      return json({ ok: true, board: stored?.board || null, updatedAt: stored?.updatedAt || null });
    }

    if (request.method === "PUT") {
      const text = await request.text();
      if (text.length > maxBoardBytes) return json({ ok: false, error: "Board too large" }, { status: 413 });
      const payload = (() => { try { return JSON.parse(text); } catch (e) { return null; } })();
      const board = payload?.board && typeof payload.board === "object" ? payload.board : payload;
      if (!board || typeof board !== "object" || Array.isArray(board)) {
        return json({ ok: false, error: "Expected a board object" }, { status: 400 });
      }

      const record = {
        board,
        updatedAt: new Date().toISOString()
      };
      await env.BOSS_BOARD.put(key, JSON.stringify(record), { expirationTtl: boardTtlSeconds });
      return json({ ok: true, updatedAt: record.updatedAt, expiresInSeconds: boardTtlSeconds });
    }

    return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
};
