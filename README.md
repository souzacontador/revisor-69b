# Revisor de Proveedores 69-B

Aplicación web (HTML5, CSS y JavaScript, sin servidor ni dependencias) que cruza los CFDI de gastos contra el listado del **artículo 69-B del CFF** por RFC, clasifica cada operación, suma el IVA y la deducción comprometidos por proveedor y calcula el plazo de 30 días hábiles (art. 12 CFF).

DSouza Consultores Fiscales · C.P. Daniel Souza Vázquez · daniel@dsouzaconsultores.mx

## Modos

| Modo | Datos | Uso |
|---|---|---|
| **DEMO** | 40 CFDI y listado ficticios del caso del laboratorio (`demo/`), fecha de revisión 30/09/2026 | Sigue los 5 pasos del caso y genera los entregables. Funciona incluso abriendo `index.html` con doble clic. |
| **REAL** | Tus CFDI (XML o ZIP) y el listado vigente del SAT | Los CFDI se leen **solo en el navegador**; no se envían a ningún servidor. |

## Criterios aplicados

- **Llave del cruce:** RFC normalizado (sin espacios, en mayúsculas, conservando Ñ y &). El nombre nunca decide; si se parece al de un contribuyente listado con otro RFC, solo se anota.
- **Veredicto según la situación vigente del proveedor**, no según la fecha de la factura:
  - **Definitivo:** sin efecto fiscal, aunque la factura sea anterior a la publicación («no producen ni produjeron efecto fiscal alguno»).
  - **Presunto:** «Riesgo potencial: proveedor en listado de presuntos». Todavía no aplica el plazo de 30 días para el cliente.
  - **Desvirtuado y Sentencia favorable:** sin riesgo.
  - **RFC no encontrado:** «RFC no encontrado en el listado consultado», con la fecha de los datos.
- **Varios episodios del mismo RFC:** se muestran todos. Si sus situaciones se contradicen, el veredicto es «Requiere revisión documental». Los importes no se duplican.
- **Plazo:** 30 días hábiles contados desde el día siguiente a la publicación del definitivo **en el DOF**. Se muestran las fechas del SAT y del DOF. Si falta la fecha del DOF: «Pendiente de verificar publicación en DOF».
  - Días inhábiles: los del art. 12 CFF, más los días adicionales de `js/dias-habiles.js` (RMF 2026, regla 2.1.6). **Actualiza esa lista cada año** con las vacaciones generales que publique el SAT.
- **Deducción:** «Monto potencialmente comprometido para deducción de ISR» = SubTotal − Descuento. En la tabla se puede ajustar el importe efectivamente deducido y el IVA acreditado. La estimación de ISR es opcional y se muestra por separado.

## Listado del 69-B (modo REAL)

El navegador no puede descargar el CSV directamente del SAT, porque el servidor del SAT no lo permite (CORS). Por eso:

1. La GitHub Action `.github/workflows/actualizar-69b.yml` corre **todos los días** a las 14:00 UTC (también se puede correr a mano desde la pestaña *Actions*).
2. `tools/actualizar-69b.js` descarga el listado oficial y lo **valida** antes de sustituir la copia:
   - debe tener estructura correcta y al menos 5,000 registros;
   - no debe caer más de 20 % respecto a la copia anterior.
3. Si la validación pasa, guarda `data/69b/Listado_completo_69-B.csv` (bytes originales) y `data/69b/meta.json`, con la fecha de la última descarga exitosa y la fecha del archivo en el servidor del SAT.
4. Si la descarga falla, **conserva la última versión válida** y la ejecución queda marcada en rojo en *Actions*.

En la app, el botón **«Cargar último listado disponible»** lee esa copia guardada; no descarga en ese momento del SAT. Como respaldo, **«Cargar CSV descargado del SAT»** acepta el archivo que bajes manualmente de los [datos abiertos del SAT](https://www.sat.gob.mx/minisitio/DatosAbiertos/contribuyentes_publicados.html).

## Publicar para pruebas en GitHub Pages

1. Crea un repositorio **público** en GitHub, por ejemplo `revisor-69b`, y sube esta carpeta.
2. En *Settings → Pages*, elige *Deploy from a branch*, rama `main` y carpeta `/ (root)`.
3. En *Settings → Actions → General → Workflow permissions*, elige *Read and write permissions*, para que la Action pueda guardar el listado.
4. En *Actions → Actualizar listado 69-B*, pulsa *Run workflow* la primera vez y confirma que termina en verde.
5. Abre `https://<tu-usuario>.github.io/revisor-69b/`.

> El repositorio público expone los datos ficticios del caso y su solución.

## Publicar en dsouzaconsultores.mx

Es un sitio estático: basta con servir esta carpeta tal cual (rutas relativas, sin compilación).

- **Vercel:** importa el repositorio como proyecto con el preset *Other* (sin comando de build). Cada commit de la Action vuelve a publicar el sitio con el listado nuevo. Después conecta un subdominio, por ejemplo `revisor69b.dsouzaconsultores.mx`, agregando en el DNS de GoDaddy el registro que indique Vercel.
- **Hosting de GoDaddy (FTP):** sube los archivos a una carpeta, por ejemplo `/revisor-69b/`. En este caso la Action no actualiza el sitio: habría que volver a subir `data/69b/` periódicamente, o usar la carga manual del CSV.

## Desarrollo y pruebas

```bash
node tests/test-clasificador.js
```

```bash
node tests/test-lector-zip.js
```

```bash
node tests/test-actualizar-69b.js
```

Las pruebas de `test-actualizar-69b.js` que usan un listado completo del SAT se omiten salvo que definas la variable `LISTADO_69B_REAL` con la ruta de una copia local del CSV.

```bash
node tools/generar-demo-data.js
```

El último comando regenera `js/demo-data.js` si cambian los archivos de `demo/`.

| Archivo | Función |
|---|---|
| `js/util.js` | Normalización de RFC, fechas y formato de moneda |
| `js/lector-csv.js` | Lectura del listado (Windows-1252, encabezado automático, episodios) |
| `js/lector-cfdi.js` | Lectura de CFDI 3.3 y 4.0 (Anexo 20) |
| `js/lector-zip.js` | Lectura de ZIP sin librerías (`DecompressionStream`) |
| `js/dias-habiles.js` | Art. 12 CFF y días inhábiles adicionales |
| `js/clasificador.js` | Cruce, veredictos, plazos y totales |
| `js/exportar.js` | CSV en UTF-8 con BOM para Excel |
| `js/app.js` | Interfaz DEMO y REAL |

Herramienta de apoyo: no sustituye el análisis profesional de cada caso ni la consulta de las publicaciones oficiales en el DOF y en el portal del SAT.
