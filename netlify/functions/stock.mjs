import { getStore } from "@netlify/blobs";
import SEED from "./seed.mjs";

// Estado compartido de la planilla. Netlify Blobs no se configura: es parte del sitio.
// Los datos viven acá, no en el HTML, así que sin la clave no se ven.
const KEY = "stock";

// Cambiar la clave: variable de entorno PEYEN_PASS en Netlify. Sin variable, esta.
const PASS = process.env.PEYEN_PASS || "PeyenMI";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default async (req) => {
  if (req.headers.get("x-peyen-pass") !== PASS) {
    return json({ error: "clave incorrecta" }, 401);
  }

  const store = getStore("peyen-stock");

  if (req.method === "GET") {
    const saved = await store.get(KEY, { type: "json" });
    // La primera vez no hay nada guardado: se arranca con los datos del último build.
    if (!saved || !saved.rows) return json({ rows: SEED, sku: {}, skuAt: {}, rowAt: {}, revisado: {}, savedAt: null });
    return json(saved);
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

    // Dos personas pueden tener la planilla abierta. Quien guarda segundo tiene que
    // enterarse de que su versión ya no es la última, en vez de borrarla en silencio.
    const current = await store.get(KEY, { type: "json" });
    if (current && current.savedAt && body.base !== current.savedAt) {
      return json({ error: "conflicto", savedAt: current.savedAt }, 409);
    }

    const savedAt = new Date().toISOString();
    await store.setJSON(KEY, {
      rows: body.rows, sku: body.sku || {}, skuAt: body.skuAt || {}, rowAt: body.rowAt || {},
      revisado: body.revisado || {}, savedAt,
    });
    return json({ savedAt });
  }

  return json({ error: "método no permitido" }, 405);
};

export const config = { path: "/api/stock" };
