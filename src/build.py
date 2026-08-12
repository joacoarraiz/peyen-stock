"""Builds peyen-stock.html from a Mercado Libre "Publicaciones" export.

Usage:  python build.py [ruta-del-export.xlsx]

The export is the file you download from ML > Publicaciones > Modificar masivamente.
Sheet "Publicaciones": headers on row 1, data from row 7.
"""
import base64
import json
import re
import sys
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent
OUT = HERE.parent / "public" / "index.html"
XLSX = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    r"C:\Users\PC\Downloads\Publicaciones-2026_08_12-11_27.xlsx")
LOGO = HERE / "peyen.png"

C = {"family": 0, "mla": 1, "variation": 3, "sku": 4, "title": 5,
     "flex": 7, "full": 8, "status": 27}


def num(v):
    try:
        return int(float(str(v).strip()))
    except (TypeError, ValueError):
        return 0


def natural(sku):
    """Sort key so 9090/A < 12039/A and K-7806 sits next to K-7806/S."""
    return [int(t) if t.isdigit() else t.lower()
            for t in re.split(r"(\d+)", sku)]


ws = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)["Publicaciones"]
raw = [list(r) for r in ws.iter_rows(min_row=7, values_only=True) if r and r[C["mla"]]]

# A publication with variants brings a parent row whose stock is ALREADY the sum of
# its variants, and whose SKU is empty. Keeping it would double-count, so the parent
# only survives as the status source for its variant rows.
status_of = {r[C["mla"]]: r[C["status"]] for r in raw if r[C["status"]]}

rows = []
for r in raw:
    sku = (r[C["sku"]] or "").strip()
    if not sku:
        continue
    var = r[C["variation"]]
    rows.append({
        "id": f"{r[C['mla']]}-{var}" if var else r[C["mla"]],
        "sku": sku,
        "mla": r[C["mla"]],
        "title": (r[C["title"]] or "").strip(),
        "stock": num(r[C["flex"]]),
        "full": num(r[C["full"]]),
        "estado": "Activa" if (r[C["status"]] or status_of.get(r[C["mla"]])) == "Activa" else "Inactiva",
        # Publications sharing a FAMILY_ID are grouped by ML: same merchandise, same stock.
        "link": str(r[C["family"]]) if r[C["family"]] else "",
        "variante": bool(var),
    })

rows.sort(key=lambda r: (natural(r["sku"]), r["mla"]))

# Publications ML groups under one FAMILY_ID hold the same merchandise (verified: their
# stock is always identical). Only the first of each group adds to the SKU total; the
# rest ship unticked so the client sees them without counting the units twice.
seen = set()
for r in rows:
    key = (r["sku"], r["link"])
    r["cuenta"] = not (r["link"] and key in seen)
    seen.add(key)

data = json.dumps({"savedAt": None, "rows": rows},
                  ensure_ascii=False).replace("<", "\\u003c")
logo = "data:image/png;base64," + base64.b64encode(LOGO.read_bytes()).decode()
fecha = re.search(r"(\d{4})_(\d{2})_(\d{2})-(\d{2})_(\d{2})", XLSX.name)
fecha = f"{fecha[3]}/{fecha[2]}/{fecha[1]} {fecha[4]}:{fecha[5]} hs" if fecha else XLSX.name

out = (HERE / "template.html").read_text(encoding="utf-8")
out = out.replace("__DATA__", data).replace("__LOGO__", logo).replace("__FECHA__", fecha)
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(out, encoding="utf-8")

skus = {r["sku"] for r in rows}
print(f"{len(rows)} publicaciones · {len(skus)} SKU · {fecha}")
print("->", OUT)
