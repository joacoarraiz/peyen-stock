/* Prueba el motor de Excel del template SIN navegador: extrae el bloque real del
   HTML generado y lo corre en Node (que ya tiene DecompressionStream y Blob).

   node src/check_excel.mjs
*/
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, "..", "public", "index.html"), "utf8");

const desde = html.indexOf("/* ================= EXCEL =================");
const hasta = html.indexOf("  // Orden natural:");
if (desde < 0 || hasta < 0) throw new Error("no encontré el bloque de Excel en el HTML");

const api = new Function("n", "partesDe", "universoSku", "state", "esc", html.slice(desde, hasta) + `
  return { buildXlsx, unzip, textoDe, leerHoja, textos, encabezado, mapearColumnas,
           nombresDeHojas, colName, CAMPOS };
`)(
  (v) => { const x = parseInt(v, 10); return isNaN(x) ? 0 : x; },
  () => null, () => ({}), { rows: [], sku: {} }, (s) => s
);

let fallos = 0;
const ok = (c, m) => { console.log((c ? "  OK  " : "FALLA ") + m); if (!c) fallos++; };

/** Abre un .xlsx igual que la app: descomprime, arma las hojas y detecta encabezado. */
async function abrir(buf) {
  const z = api.unzip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const claves = Object.keys(z)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  const ss = await api.textoDe(z["xl/sharedStrings.xml"]);
  const shared = (ss.match(/<si>[\s\S]*?<\/si>/g) || []).map(api.textos);
  const nombres = api.nombresDeHojas(await api.textoDe(z["xl/workbook.xml"]));
  const hojas = [];
  for (let i = 0; i < claves.length; i++) {
    const filas = api.leerHoja(await api.textoDe(z[claves[i]]), shared);
    if (filas.length > 1) hojas.push({ nombre: nombres[i] || `Hoja ${i + 1}`, filas });
  }
  return hojas;
}

/* ---------- 1. escribir y volver a leer ---------- */
const filas = [
  ["SKU", "MLA", "Titulo", "Estado", "Precio", "Stock en ML", "Stock real", "Diferencia",
   "Suma al total", "Que cambio", "Link"],
  ["K-7806", "MLA1493593951", "Kit Pernos Caliper VW Bora Golf", "Activa", 20375, 5, 8, 3, "Si",
   "stock 8 -> 5", "https://articulo.mercadolibre.com.ar/MLA-1493593951-_JM"],
  ["K-7806", "MLA2068905132", 'Kit "Pernos" & Caliper <Ford> Ecosport', "Inactiva", 0, 0, "", "", "No", "", ""],
  ["6811 + TS-30023", "MLA2609575884", "Bomba Freno 1'' Pala Michigan + Líquido", "Activa",
   99900, 12, 12, 0, "Si", "", ""],
];
const bytes = Buffer.from(await api.buildXlsx(filas).arrayBuffer());
const tmp = join(HERE, "..", "_prueba.xlsx");
writeFileSync(tmp, bytes);
ok(bytes.length > 800, `xlsx escrito (${bytes.length} bytes)`);

const propio = await abrir(bytes);
const head0 = api.encabezado(propio[0].filas);
const m0 = api.mapearColumnas(propio[0].filas, head0, "pub");
ok(propio.length === 1 && propio[0].nombre === "Stock", "una hoja, se lee su nombre");
ok(m0.mla === 1 && m0.sku === 0 && m0.title === 2 && m0.estado === 3 && m0.stock === 5,
  "columnas propias mapeadas solas");
ok(m0.price === 4, `precio mapeado (${m0.price}), sin confundirlo con el stock`);
const rt = propio[0].filas.slice(head0 + 1);
ok(rt.length === 3, `vuelven las 3 filas (${rt.length})`);
ok(rt[1][2] === 'Kit "Pernos" & Caliper <Ford> Ecosport', "comillas, & y <> sobreviven");
ok(rt[2][0] === "6811 + TS-30023", "el SKU combo se mantiene entero");
unlinkSync(tmp);

/* ---------- 2. las columnas se detectan por NOMBRE, no por posición ---------- */
{
  // mismas columnas, orden distinto, con basura en el medio y nombres variados
  const revuelto = [
    ["Notas", "STATUS", "Precio", "TITLE", "FAMILY_ID", "STOCK_FULL", "sku", "Stock_Flex", "item_id"],
    ["x", "Activa", "1000", "Bomba de freno", "77", "2", "K-7806", "5", "MLA1493593951"],
  ];
  const m = api.mapearColumnas(revuelto, 0, "pub");
  ok(m.mla === 8, `MLA en la última columna, lo encuentra igual (col ${m.mla})`);
  ok(m.sku === 6 && m.title === 3 && m.estado === 1 && m.link === 4,
    "SKU, título, estado y agrupador ubicados por nombre");
  ok(m.stock === 7, `stock = Stock_Flex (${m.stock}), no STOCK_FULL (5)`);
  ok(api.mapearColumnas([["ITEM_ID", "SKU", "STOCK_FULL"]], 0, "pub").stock === -1,
    "si solo hay STOCK_FULL prefiere no mapear stock antes que tomar el de Full");

  // nombres parecidos pero no idénticos
  const variantes = [["Código de producto", "Descripción", "Stock actual"], ["A-1", "Bomba", "4"]];
  const v = api.mapearColumnas(variantes, 0, "sku");
  ok(v.sku === 0 && v.stock === 2 && v.title === 1,
    "aguanta nombres aproximados: «Código de producto», «Stock actual»");
}

/* ---------- 3. export de publicaciones de Mercado Libre ---------- */
try {
  const hojas = await abrir(readFileSync("C:/Users/PC/Downloads/Publicaciones-2026_08_12-11_27.xlsx"));
  const h = hojas.reduce((a, b) => (b.filas.length > a.filas.length ? b : a));
  ok(h.nombre === "Publicaciones", `elige la hoja grande: ${h.nombre}`);
  const head = api.encabezado(h.filas);
  const m = api.mapearColumnas(h.filas, head, "pub");
  const hdr = h.filas[head];
  ok(hdr[m.mla] === "ITEM_ID" && hdr[m.sku] === "SKU" && hdr[m.title] === "TITLE",
    "MLA/SKU/Título mapeados por ITEM_ID/SKU/TITLE");
  ok(hdr[m.stock] === "STOCK_FLEX", "stock = STOCK_FLEX (no el de Full)");
  ok(hdr[m.estado] === "STATUS" && hdr[m.link] === "FAMILY_ID",
    "estado y agrupador de ML mapeados");
  const datos = h.filas.slice(head + 1).filter((r) => r && /^MLA\d+/.test(String(r[m.mla] || "")));
  ok(datos.length === 574, `574 filas de datos (${datos.length})`);
  ok(datos.filter((r) => !String(r[m.sku] || "").trim()).length === 2,
    "quedan las 2 filas madre de variantes, que el importador descarta");
} catch (e) {
  if (e.code === "ENOENT") console.log("  --  sin el export de ML, salteo");
  else throw e;
}

/* ---------- 4. planilla de stock del cliente ---------- */
try {
  const hojas = await abrir(readFileSync("C:/Users/PC/Downloads/PROD PEYEN PARA MLIBRE  .xlsx"));
  const h = hojas.find((x) => x.nombre === "productos");
  ok(!!h, "encuentra la hoja 'productos' entre las 28 del archivo");
  const head = api.encabezado(h.filas);
  const m = api.mapearColumnas(h.filas, head, "sku");
  const hdr = h.filas[head];
  ok(String(hdr[m.sku]).trim() === "Código", "SKU = columna Código");
  // la trampa: hay 35 columnas de stock por fecha y la buena es la última con datos
  ok(String(hdr[m.stock]).trim() === "3/8 stock",
    `stock = última columna cargada, no la primera (dio "${String(hdr[m.stock]).trim()}")`);
  const codigos = h.filas.slice(head + 1)
    .map((r) => String((r && r[m.sku]) || "").trim()).filter(Boolean);
  ok(codigos.length === 541, `541 códigos (${codigos.length})`);
  const conStock = h.filas.slice(head + 1).filter((r) => r && String(r[m.stock] ?? "").trim() !== "");
  ok(conStock.length === 541, `541 con stock en esa columna (${conStock.length})`);

  // cruce contra el catálogo
  const seedSrc = readFileSync(join(HERE, "..", "netlify", "functions", "seed.mjs"), "utf8");
  const seed = JSON.parse(seedSrc.slice(seedSrc.indexOf("export default") + 14).trim().replace(/;$/, ""));
  const nuestros = new Set(seed.map((r) => r.sku));
  const cruzan = codigos.filter((c) => nuestros.has(c)).length;
  ok(cruzan === 490, `490 códigos del cliente cruzan con el catálogo (${cruzan})`);
} catch (e) {
  if (e.code === "ENOENT") console.log("  --  sin la planilla del cliente, salteo");
  else throw e;
}

console.log(fallos ? `\n${fallos} FALLAS` : "\nMotor de Excel OK");
process.exit(fallos ? 1 : 0);
