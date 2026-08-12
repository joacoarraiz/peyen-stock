# Peyen · Control de stock por SKU

Planilla web para ver y editar el stock de Peyen en Mercado Libre: cada SKU con todas sus
publicaciones (MLA), título, estado y stock, y el total real del SKU calculado arriba.

**El repositorio tiene que ser privado.** `public/index.html` lleva adentro el catálogo completo
del cliente: 492 SKU con títulos, precios de referencia y stock.

---

## Cómo se calcula el stock del SKU

Sumar el stock de todos los MLA da un número inflado. Sobre este catálogo, sumar todo da
**8.926 unidades** y el número real es **8.019**: hay **907 unidades fantasma**.

Pasa porque el mismo SKU está publicado más de una vez. Mercado Libre agrupa algunas de esas
publicaciones (comparten el `FAMILY_ID` del export) y les sincroniza el stock: son la misma
mercadería mostrada dos veces. Esas vienen con la casilla **Suma** destildada y el cartel
`COMPARTE STOCK`, y si se edita el stock en una se actualiza en las demás.

El agrupador de ML resuelve 45 casos, pero no todos. Quedan **14 SKU** donde el mismo stock
aparece en dos grupos distintos que ML no relacionó — por ejemplo `K-7806`, con 4 publicaciones
activas de 5 unidades cada una: pueden ser 20 en el galpón o 5 publicadas cuatro veces. El dato
no alcanza para decidirlo. Esos SKU van marcados **REVISAR** (hay un filtro para verlos solos) y
los resuelve quien conoce el depósito destildando la casilla **Suma**.

Reglas del total, en una línea: suma las publicaciones **activas** con **Suma** tildada.

## Dónde se guardan los cambios

| Dónde está abierta | Qué dice el cartel | Dónde quedan los cambios |
|---|---|---|
| Publicada en Netlify | Guardado para todos | En el servidor: los ve cualquiera que la abra |
| Archivo suelto o portal | Guardado en este navegador | Solo en esa computadora |

Publicada en Netlify, la planilla guarda contra `/api/stock` (Netlify Blobs) y **sondea el
servidor cada 30 segundos**: si la otra persona guardó, los números se actualizan solos y avisa
con un cartel. Si dos personas editan a la vez, quien guarda segundo recibe la pregunta de si
pisa la versión del otro o descarta lo suyo — nunca se borra trabajo en silencio.

El botón **Descargar copia** genera un HTML con los datos adentro. Sirve como respaldo y como
forma de mover los datos cuando no hay servidor.

---

## Publicar

### 1. GitHub (privado)

```bash
git remote add origin git@github.com:USUARIO/peyen-stock.git
git push -u origin main
```

### 2. Netlify

1. En Netlify: **Add new site → Import an existing project → GitHub** y elegir el repo.
2. Netlify lee `netlify.toml`: publica `public/` y toma las funciones de `netlify/functions/`.
   No hay build que configurar.
3. Deploy. La planilla queda en `https://<sitio>.netlify.app`.

El almacenamiento (Netlify Blobs) no se configura: es parte del sitio.

### 3. Clave de acceso (opcional)

Sin clave, cualquiera con el link puede editar. Para cerrarlo:

**Site configuration → Environment variables →** `PEYEN_PASS` = la clave que quieras.

La planilla la pide una vez por navegador y la recuerda. Cambiar la variable saca a todos.

---

## Actualizar los datos el mes que viene

1. Bajar de Mercado Libre: **Publicaciones → Modificar masivamente** (el .xlsx con la hoja
   `Publicaciones`, que trae `FAMILY_ID` y `STATUS`).
2. Regenerar y verificar:

```bash
python src/build.py "C:/ruta/al/Publicaciones-2026_09_10-11_27.xlsx" && python src/check.py
```

3. Commit y push: Netlify redeploya solo.

**Ojo:** regenerar reemplaza los datos que trae el archivo, pero **no** pisa lo que está guardado
en el servidor — la planilla sigue mostrando lo guardado. Para arrancar de cero con los datos
nuevos, el botón **Restaurar** y después **Guardar**.

## Archivos

| Archivo | Qué es |
|---|---|
| `public/index.html` | La planilla generada. Es lo que se publica. |
| `src/template.html` | El HTML fuente, con `__DATA__`, `__LOGO__` y `__FECHA__` sin reemplazar. |
| `src/build.py` | Lee el export de ML y escribe `public/index.html`. |
| `src/check.py` | Verifica la matemática del stock. Falla ruidosamente si algo se rompe. |
| `netlify/functions/stock.mjs` | GET/PUT del estado compartido sobre Netlify Blobs. |
