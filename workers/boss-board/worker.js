const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

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
  return `board:${parts.pop() || "current"}`;
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

    if (request.method === "GET") {
      const stored = await env.BOSS_BOARD.get(key, "json");
      return json({ ok: true, board: stored?.board || null, updatedAt: stored?.updatedAt || null });
    }

    if (request.method === "PUT") {
      const payload = await request.json().catch(() => null);
      const board = payload?.board && typeof payload.board === "object" ? payload.board : payload;
      if (!board || typeof board !== "object" || Array.isArray(board)) {
        return json({ ok: false, error: "Expected a board object" }, { status: 400 });
      }

      const record = {
        board,
        updatedAt: new Date().toISOString()
      };
      await env.BOSS_BOARD.put(key, JSON.stringify(record));
      return json({ ok: true, updatedAt: record.updatedAt });
    }

    return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
};
