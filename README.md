# Peyen · Control de stock por SKU

Planilla web con clave para manejar el stock de Peyen en Mercado Libre. Cuatro vistas:

- **Por SKU** — se carga el stock físico y el precio de cada SKU. El stock se reparte entre sus
  publicaciones; el precio baja igual a todas sus publicaciones, activas o no.
- **Por publicación** — cada MLA con su título, estado y stock, agrupado por SKU.
- **En Full** — la mercadería que está en el depósito de Mercado Libre, editable aparte.
- **Ventas** — el historial de ventas, que descuenta stock a partir de la segunda carga.

Los cambios se guardan en el servidor: los ve cualquiera que entre con la clave.

Tiene **modo claro y oscuro** — arranca según lo que tenga configurado el sistema y el botón ◐
de la barra lo cambia y se lo acuerda. Toda la paleta son variables CSS: para retocar colores se
tocan los bloques `:root` y `[data-tema="oscuro"]` del `<style>`, nada más.

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
- Cuando el total da **0** pero hay unidades, el motivo va debajo: **«N pausadas»** si están en
  publicaciones inactivas, **«N sin sumar»** si la casilla *Suma* está destildada. En este
  catálogo hay **34 SKU con 314 unidades** que solo viven en publicaciones pausadas.

Ejemplo real del catálogo: `68501/A` con 3 unidades, usado por 3 publicaciones (dos propias y
un combo) → 1 a cada una. Si `TS-30023`, la otra parte del combo, no alcanza para dar 1 por
publicación, el combo queda en 0 y sobran 2 unidades de `68501/A` reservadas sin poder venderse.

### Qué hay que actualizar en Mercado Libre

Es lo que se usa después de que el cliente sube su Excel. La vista **por publicación** marca cada
MLA cuyo stock o precio cambió, con el valor anterior al lado (`stock 12 → 19`), y el filtro
**Solo las que hay que actualizar** deja nada más que esas: la lista de trabajo.

**Descargar Excel** respeta el filtro, así que con esa lista en pantalla el archivo sale con las
publicaciones a tocar y nada más, e incluye las columnas *Que cambio* y *Link*.

**Marcar actualizadas** borra las marcas cuando el trabajo ya está hecho en Mercado Libre.

### Encontrar qué SKU cambió

Lo mismo pero a nivel SKU, en su propia vista. Marca **solo los que cambiaron de valor**, no los que fueron
tocados: de una importación de 470 filas quedaron marcados 429, porque 41 traían el mismo
número que ya había.

Cada uno muestra **de dónde venía y hace cuánto** (`12 → 19 · recién`), en rojo si bajó. Hay
un filtro *Solo los que cambiaron* y un orden *por último cambio*. La marca se borra sola si
el valor vuelve al original, y **Marcar revisados** limpia todas de una para que la próxima
carga arranque en cero.

### Publicaciones sincronizadas y de catálogo

Cuando la misma mercadería está publicada dos veces —catálogo, o dos publicaciones que ML
muestra como *«Sincronizada con #…»*— **el stock no se divide entre ellas**: es el mismo stock
mostrado dos veces. Se reconocen por el `FAMILY_ID` del export y cuentan como **un solo
consumidor** en el reparto.

Llevan el cartel **AGRUPADA**, y un clic lo separa si la agrupación está mal — eso queda marcado
para que una importación nueva no vuelva a unirlas. Al separar una, si el grupo que deja se queda
sin ninguna que sume, la primera que queda pasa a contar: si no, su stock se volvería invisible.

Verificado sobre este catálogo: los **41** productos de catálogo con más de una publicación
vienen agrupados por `FAMILY_ID`, ninguno queda suelto. En los 45 grupos el **stock coincide
siempre**, pero el **precio difiere en 12** (de 0,4% a 21,3%): es la publicación que ofrece cuotas,
que sale más cara. Por eso el precio no se empareja dentro del grupo, se marca con **OTRO PRECIO**.
Tampoco hay ningún caso de mismo SKU y mismo título en familias distintas, así que no quedan
publicaciones que ML debería haber agrupado y no agrupó. `SF-100` tiene 2 publicaciones
sincronizadas y con 7 unidades las dos muestran 7; `K-7806/S` tiene 4 publicaciones distintas
(distinto vehículo) y con 12 unidades cada una recibe 3.

### Precio, link y foto

El **precio** viene de los dos Excel (`PRICE` en el de ML, `PRECIO ML` en el del cliente) y se
edita por publicación o por SKU. La fila del SKU muestra un precio si todas coinciden, o el rango.

**Generar links** arma el link de todas las publicaciones a partir del número de MLA, con el
formato estándar `MLA-<numero>-<titulo>-_JM`. Las que ya tenían link cargado no se tocan, y
cualquiera se corrige a mano desde el botón 🔗 de su fila.

La **foto es siempre manual**: se pega la URL de la imagen en ese mismo botón. No se puede
automatizar — verificado en agosto de 2026: la API de Mercado Libre devuelve 403 sin credenciales
(`api.mercadolibre.com/items/...` y `/sites/MLA/search`), y la página pública redirige a un muro
anti-bot tanto desde un navegador automatizado como desde `curl`. Se destrabaría con una app de ML
con credenciales OAuth: con eso la API devuelve `permalink` y `pictures` de una.

### La mercadería en Full

El stock que está en el depósito de Mercado Libre se maneja en su propia pestaña, **con su
propio número**. No entra en el reparto —esas unidades ya no están en el galpón— pero **sí suma
al total del SKU**, porque se venden igual.

Por eso **una venta despachada por Full descuenta del Full de esa publicación, no del galpón**.
La devolución de una venta Full devuelve las unidades a Full, y borrar la venta también. Si una
venta llega marcada como Full pero la publicación no tiene unidades cargadas ahí, no se descuenta
de ningún lado y el aviso lo dice.

La pestaña lista las publicaciones que hoy tienen Full, con el número editable y, al lado, cuánto
tienen en depósito para comparar. **+ Agregar a Full** abre el buscador de publicaciones que
todavía no están (por MLA, SKU o título): al elegir una entra con 1 y el cursor queda en el
número para escribir la cantidad real. La **✕** de cada fila la saca de Full.

### Combos que no se pueden calcular

De los 104 SKU combo, **solo 53 tienen todas sus partes como SKU propio**. Los otros 51
(`BAR 24786 + FRI 485`) referencian códigos que no existen sueltos en el catálogo, así que no hay
de dónde sacarles el stock: se tratan como un SKU normal y se cargan a mano.

### Stock fantasma

Sumar el stock de todas las publicaciones da **8.926 unidades**; el real es **8.019**. Los
**907 de diferencia** son publicaciones agrupadas contadas dos veces.

En la vista por publicación, la casilla **Suma** de cada fila controla cuáles entran en el total;
con el grupo cerrado, la misma columna resume cuántas suman (`1 de 2`, `todas`).

**14 SKU** quedan marcados `REVISAR` porque tienen dos publicaciones distintas con el mismo stock
— puede ser la misma mercadería cargada dos veces. Eso lo confirma quien conoce el depósito:
**un clic en el cartel lo saca**. Si después cambian los números por los que se levantó, el aviso
vuelve solo, porque ya no es la situación que se revisó.

## Ventas

Una fila por venta: fecha, número, SKU, publicación, título, unidades, envío (Full o ME) y
estado. Se cargan desde el reporte de **Ventas** de Mercado Libre con el mismo botón que todo
lo demás, y se pueden agregar, editar y borrar a mano, de a una o varias.

**La primera carga es el histórico y no toca el stock**: la casilla *Descontar estas ventas del
stock* viene destildada mientras no haya ventas cargadas, y tildada de ahí en más.

**Bajar el mismo archivo dos veces no descuenta dos veces.** El cruce es por número de venta:
lo ya cargado se ignora. Verificado con el reporte real — reimportarlo da 0 nuevas y 783
ignoradas, con el botón deshabilitado.

**Devoluciones y cancelaciones se detectan por el estado** (`Devolución…`, `Cancelada…`,
`Mediación…con reembolso`) y no consumen mercadería. Cada venta recuerda cuánto descontó, así
que si una venta ya aplicada aparece devuelta en la carga siguiente, **el stock vuelve solo**.
Borrar una venta también devuelve lo que había descontado.

Trampas del reporte de ML que resuelve solo:

- Las filas **«Paquete de N productos»** son un encabezado sin producto: se descartan. Los
  productos del paquete vienen después como ventas propias con su número.
- La **fecha es texto en castellano** (`18 de agosto de 2026 20:45 hs.`). Ordenar el texto crudo
  miente —alfabéticamente *abril* va antes que *enero*—, así que se convierte a fecha real.
- El **estado mezcla estados con etiquetas**, por eso se clasifica por substring y no por
  igualdad.

Sobre el archivo de enero a agosto: 791 filas → **783 ventas** (8 encabezados de paquete),
819 unidades, 54 devoluciones y 27 canceladas, 117 por Full y 666 por Mercado Envíos.

## Excel

**Descargar Excel** baja la tabla de publicaciones (SKU, MLA, título, estado, stock, suma).

**Cargar Excel** abre un asistente en vez de aplicar nada a ciegas. Acepta cualquier planilla:

1. **Hoja** — las lista todas con su cantidad de filas y elige la más grande.
2. **Tipo** — *publicaciones* (una fila por MLA) o *stock por SKU* (sin MLA). Lo adivina solo
   buscando una columna de MLA en los encabezados.
3. **Columnas** — qué columna es cada campo, con el nombre real del archivo al lado. Se puede
   cambiar a mano.
4. **Qué pisar** — tildar solo stock, o también título y estado.
5. **Qué filas** — por lote (las que ya están / las nuevas / las que traen 0) o una por una,
   con el detalle de por qué cada fila entra o queda afuera.

Lo que ya existe se reconoce por **MLA** (publicaciones) o por **SKU** (stock), y solo se
actualiza; lo que no existe se agrega. Nunca borra filas que el archivo no traiga.

Casos que resuelve solo:

- La planilla del cliente agrega **una columna de stock por fecha** (`STOCK`, `14-3 stock`,
  … `3/8 stock`). Elige **la última que tenga datos**, no la primera que encuentra.
- Una **celda de stock vacía no es un cero**: esa fila queda afuera con el cartel *sin dato de
  stock* en vez de borrar lo que ya había.
- Las **filas madre de variantes** del export de ML (SKU vacío, stock ya sumado) se descartan.
- El **agrupador de ML** (`FAMILY_ID`) se importa siempre: sin él vuelven las unidades fantasma.
- Los **combos calculables** no se importan aunque el archivo traiga un número: salen de sus partes.

El motor de Excel no usa librerías: escribe el ZIP a mano y lee con `DecompressionStream`.
Por eso **hay que abrirla con Chrome o Edge**.

## Agregar a mano

**+ Agregar publicación** pide SKU, MLA, título, stock y estado en un formulario. Desde
**+ Publicación** dentro de un SKU, el SKU viene puesto y bloqueado. En la vista por SKU el
mismo botón pide solo SKU y stock, y crea un SKU sin publicaciones (el stock queda cargado y
se reparte cuando le agregues una).

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
