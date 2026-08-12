# Peyen · Control de stock por SKU

Planilla web con clave para manejar el stock de Peyen en Mercado Libre. Dos vistas:

- **Por SKU** — se carga el stock físico de cada SKU y se reparte solo entre sus publicaciones.
- **Por publicación** — cada MLA con su título, estado y stock, agrupado por SKU.

Los cambios se guardan en el servidor: los ve cualquiera que entre con la clave.

**El repositorio tiene que ser privado.** `netlify/functions/seed.mjs` lleva el catálogo completo
del cliente. El HTML publicado no lleva datos adentro — se piden al servidor después del login.

---

## Cómo se reparte el stock

Peyen tiene N unidades de un SKU y lo publica en varias MLA. Poner N en cada publicación es
prometer stock que no existe, así que **el stock se divide** entre las publicaciones que usan
ese SKU:

```
Stock del SKU ÷ publicaciones que lo usan = lo que recibe cada una
```

Reglas:

- Las publicaciones que **Mercado Libre agrupa** (mismo `FAMILY_ID`) cuentan como **una sola**:
  comparten la misma mercadería y ML les sincroniza el número.
- Las publicaciones **inactivas** no reciben stock.
- Un **combo** consume una unidad de cada SKU que lo compone, así que se lleva **el mínimo**
  entre lo que le tocó de cada parte. **Si una parte queda en 0, el combo queda en 0.**
- La división es entera. Lo que no llega a repartirse queda como **«sobran N»** en la vista
  por SKU — es stock declarado que ninguna publicación está mostrando.

Ejemplo real del catálogo: `68501/A` con 3 unidades, usado por 3 publicaciones (dos propias y
un combo) → 1 a cada una. Si `TS-30023`, la otra parte del combo, no alcanza para dar 1 por
publicación, el combo queda en 0 y sobran 2 unidades de `68501/A` reservadas sin poder venderse.

### Combos que no se pueden calcular

De los 104 SKU combo, **solo 53 tienen todas sus partes como SKU propio**. Los otros 51
(`BAR 24786 + FRI 485`) referencian códigos que no existen sueltos en el catálogo, así que no hay
de dónde sacarles el stock: se tratan como un SKU normal y se cargan a mano.

### Stock fantasma

Sumar el stock de todas las publicaciones da **8.926 unidades**; el real es **8.019**. Los
**907 de diferencia** son publicaciones agrupadas contadas dos veces. En la vista por publicación,
la casilla **Suma** controla cuáles entran en el total, y **14 SKU** quedan marcados `REVISAR`
porque tienen dos publicaciones distintas con el mismo stock — puede ser la misma mercadería
cargada dos veces, y eso lo confirma quien conoce el depósito.

## Excel

- **Descargar Excel** baja la tabla de publicaciones (SKU, MLA, título, estado, stock, suma).
- **Cargar Excel** acepta esa misma planilla editada, o un **export nuevo de Mercado Libre**
  (Publicaciones → Modificar masivamente). Reconoce cuál es por los encabezados y muestra un
  resumen de qué cambia antes de aplicar nada.

El motor de Excel no usa librerías: escribe el ZIP a mano y lee con `DecompressionStream`.
Por eso **hay que abrirla con Chrome o Edge**.

## Guardado

Guarda contra `/api/stock` (Netlify Blobs) y **sondea cada 30 segundos**: si la otra persona
guardó, los números se actualizan solos. Si dos personas editan a la vez, quien guarda segundo
elige si pisa la versión del otro o descarta la suya — nunca se borra trabajo en silencio.

---

## Publicar

### 1. GitHub (privado)

```bash
git push
```

### 2. Netlify

**Add new site → Import an existing project → GitHub** y elegir el repo. Netlify lee
`netlify.toml`: publica `public/` y toma las funciones de `netlify/functions/`. No hay build
que configurar.

### 3. Clave

La clave por defecto es **`PeyenMI`**, escrita en `netlify/functions/stock.mjs`. Para cambiarla
sin tocar código: **Site configuration → Environment variables →** `PEYEN_PASS`, y después
**Deploys → Trigger deploy**. La variable le gana al valor del código.

---

## Actualizar los datos

Lo normal es hacerlo desde la planilla misma: **Cargar Excel** con el export nuevo de Mercado
Libre. No hace falta tocar el repo.

Para regenerar los datos iniciales (los que ve alguien que entra por primera vez, antes del
primer guardado):

```bash
python src/build.py "C:/ruta/Publicaciones-2026_09_10-11_27.xlsx" && python src/check.py
```

## Archivos

| Archivo | Qué es |
|---|---|
| `public/index.html` | La planilla. Se publica sin datos adentro. |
| `netlify/functions/stock.mjs` | Clave, GET/PUT del estado compartido, detección de conflicto. |
| `netlify/functions/seed.mjs` | Datos iniciales. Lo genera `build.py`. |
| `src/template.html` | El HTML fuente, con `__LOGO__` sin reemplazar. |
| `src/build.py` | Lee el export de ML → `public/index.html` + `seed.mjs`. |
| `src/check.py` | Verifica la matemática del stock y que el HTML no lleve datos. |
| `src/check_excel.mjs` | Corre el motor de Excel del HTML en Node, sin navegador. |
