"""Runnable check for the stock math baked into peyen-stock.html.

python check.py   ->  fails loudly if the SKU totals stop making sense.
"""
import collections
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
seed = (HERE.parent / "netlify" / "functions" / "seed.mjs").read_text(encoding="utf-8")
rows = json.loads(seed[seed.index("export default") + 14:].rstrip().rstrip(";"))

# El HTML se publica sin datos adentro: sin la clave no se ve el catálogo.
html = (HERE.parent / "public" / "index.html").read_text(encoding="utf-8")
assert not re.search(r"MLA\d{6}", html), "el HTML quedó con datos adentro"

by_sku = collections.defaultdict(list)
for r in rows:
    by_sku[r["sku"]].append(r)


def total(rs):
    """Same rule as the page: active publications with the Suma box ticked."""
    return sum(r["stock"] + r["full"] for r in rs
               if r["cuenta"] and r["estado"] == "Activa")


# 1. A grouped family must carry one identical stock number across its publications.
groups = collections.defaultdict(list)
for r in rows:
    if r["link"]:
        groups[(r["sku"], r["link"])].append(r)
for key, g in groups.items():
    assert len({r["stock"] for r in g}) == 1, f"stock desparejo en {key}: {g}"

# 2. Exactly one publication per grouped family adds to the total.
for key, g in groups.items():
    assert sum(1 for r in g if r["cuenta"]) == 1, f"doble conteo en {key}"

# 3. No publication is counted without an MLA, and no MLA+SKU pair repeats.
ids = [r["id"] for r in rows]
assert len(ids) == len(set(ids)), "hay ids repetidos"
assert all(r["mla"] for r in rows), "hay publicaciones sin MLA"

# 4. Known totals, hand-checked against the export.
for sku, esperado in {"SF-100": 9, "HE-014": 12, "TS-30023": 1, "FM-3912": 9}.items():
    got = total(by_sku[sku])
    assert got == esperado, f"{sku}: total {got}, esperaba {esperado}"

naive = sum(r["stock"] + r["full"] for r in rows if r["estado"] == "Activa")
real = sum(total(v) for v in by_sku.values())
revisar = [s for s, v in by_sku.items()
           if len([x for x in v if x["cuenta"] and x["estado"] == "Activa"]) > 1
           and len({x["stock"] for x in v if x["cuenta"] and x["estado"] == "Activa"})
               < len([x for x in v if x["cuenta"] and x["estado"] == "Activa"])
           and max(x["stock"] for x in v) > 0]

print(f"OK · {len(by_sku)} SKU · {len(rows)} publicaciones")
print(f"   sumando todo: {naive} unidades")
print(f"   descontando publicaciones agrupadas: {real} unidades ({naive - real} fantasma)")
print(f"   SKU marcados REVISAR: {len(revisar)} -> {', '.join(sorted(revisar))}")
