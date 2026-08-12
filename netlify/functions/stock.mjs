import { getStore } from "@netlify/blobs";

// Shared storage for the stock sheet. Netlify Blobs needs no setup: it is part of
// the site. GET returns whatever was saved last, PUT overwrites it.
const KEY = "stock";

// Optional shared password. Set PEYEN_PASS in the Netlify site settings to lock
// the sheet; leave it unset and the site works without asking for anything.
function denied(req) {
  const pass = process.env.PEYEN_PASS;
  if (!pass) return null;
  if (req.headers.get("x-peyen-pass") === pass) return null;
  return json({ error: "clave incorrecta" }, 401);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default async (req) => {
  const blocked = denied(req);
  if (blocked) return blocked;

  const store = getStore("peyen-stock");

  if (req.method === "GET") {
    const saved = await store.get(KEY, { type: "json" });
    return json(saved || { rows: null, savedAt: null });
  }

  if (req.method === "PUT") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "cuerpo inválido" }, 400);
    }
    if (!Array.isArray(body.rows) || !body.rows.length) {
      return json({ error: "faltan las filas" }, 400);
    }

    // Two people can have the sheet open. Whoever saves second must know that the
    // version they loaded is no longer the latest, instead of silently erasing it.
    const current = await store.get(KEY, { type: "json" });
    if (current && current.savedAt && body.base !== current.savedAt) {
      return json({ error: "conflicto", savedAt: current.savedAt }, 409);
    }

    const savedAt = new Date().toISOString();
    await store.setJSON(KEY, { rows: body.rows, savedAt, editor: body.editor || "" });
    return json({ savedAt });
  }

  return json({ error: "método no permitido" }, 405);
};

export const config = { path: "/api/stock" };
