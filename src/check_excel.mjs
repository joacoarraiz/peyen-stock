/* Prueba el motor de Excel del template SIN navegador: extrae el bloque real del
   HTML generado y lo corre en Node (que ya tiene DecompressionStream y Blob).

   node src/check_excel.mjs [export-de-ML.xlsx]
*/
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, "..", "public", "index.html"), "utf8");

// El bloque de Excel vive dentro del IIFE: se recorta por marcas y se evalúa suelto.
const desde = html.indexOf("/* ================= EXCEL =================");
const hasta = html.indexOf("function cargarExcel");
if (desde < 0 || hasta < 0) throw new Error("no encontré el bloque de Excel en el HTML");
const src = html.slice(desde, hasta);

const api = new Function("n", src + `
  return { buildXlsx, unzip, textoDe, leerHoja, textos, detectar, filasDeML, filasDePlanilla, COLS };
`)(v => { const x = parseInt(v, 10); return isNaN(x) ? 0 : x; });

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? "  OK  " : "FALLA ") + msg); if (!cond) fallos++; };

/* ---------- 1. escribir ---------- */
const filas = [
  api.COLS,
  ["K-7806", "MLA1493593951", "Kit Pernos Caliper VW Bora Golf", "Activa", 5, "Si"],
  ["K-7806", "MLA2068905132", 'Kit "Pernos" & Caliper <Ford> Ecosport', "Inactiva", 0, "No"],
  ["6811 + TS-30023", "MLA2609575884", "Bomba Freno 1'' Pala Michigan + Líquido", "Activa", 12, "Si"],
];
const blob = api.buildXlsx(filas);
const bytes = Buffer.from(await blob.arrayBuffer());
const tmp = join(HERE, "..", "_prueba.xlsx");
writeFileSync(tmp, bytes);
ok(bytes.length > 800, `xlsx escrito (${bytes.length} bytes)`);

/* ---------- 2. leerlo de vuelta ---------- */
const leer = async (buf) => {
  const z = api.unzip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const ss = await api.textoDe(z["xl/sharedStrings.xml"]);
  const shared = (ss.match(/<si>[\s\S]*?<\/si>/g) || []).map(api.textos);
  const hojas = Object.keys(z).filter((k) => /^xl\/worksheets\/.*\.xml$/.test(k));
  for (const h of hojas) {
    const f = api.leerHoja(await api.textoDe(z[h]), shared);
    const d = api.detectar(f);
    if (d) return { filas: f, d };
  }
  return null;
};

const round = await leer(bytes);
ok(round && round.d.tipo === "planilla", "se reconoce como planilla propia");
const rt = round.filas.slice(1);
ok(rt.length === 3, `vuelven las 3 filas (${rt.length})`);
ok(rt[1][2] === 'Kit "Pernos" & Caliper <Ford> Ecosport', "comillas, & y <> sobreviven al viaje");
ok(rt[2][0] === "6811 + TS-30023", "el SKU combo se mantiene entero");
ok(String(rt[0][4]) === "5", "el stock vuelve como número");

/* ---------- 3. el export real de Mercado Libre ---------- */
const xlsx = process.argv[2] ||
  "C:/Users/PC/Downloads/Publicaciones-2026_08_12-11_27.xlsx";
try {
  const buf = readFileSync(xlsx);
  const hit = await leer(buf);
  ok(hit && hit.d.tipo === "ml", "el export de ML se reconoce solo");
  const rows = api.filasDeML(hit.filas, hit.d);
  ok(rows.length === 572, `572 publicaciones (${rows.length})`);
  ok(new Set(rows.map((r) => r.sku)).size === 492, "492 SKU");
  ok(rows.every((r) => r.sku), "ninguna fila sin SKU (las madres de variantes se descartan)");

  // el resultado tiene que coincidir con lo que produce build.py
  const seed = (await import("../netlify/functions/seed.mjs")).default;
  const clave = (r) => [r.id, r.sku, r.stock, r.full, r.estado, r.link, r.cuenta].join("|");
  const a = new Set(seed.map(clave)), difs = rows.filter((r) => !a.has(clave(r)));
  ok(difs.length === 0, `coincide fila por fila con build.py${difs.length ? ": " + JSON.stringify(difs[0]) : ""}`);
} catch (e) {
  if (e.code === "ENOENT") console.log("  --  sin el export de ML a mano, salteo esa parte");
  else throw e;
}

console.log(fallos ? `\n${fallos} FALLAS` : "\nMotor de Excel OK");
process.exit(fallos ? 1 : 0);
