/* Pruebas de tools/actualizar-69b.js. Solo usan archivos locales y carpetas temporales.
 * Ejecutar: node tests/test-actualizar-69b.js
 * Nunca escriben en data/69b: esa carpeta se compara antes y después de la corrida. */
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..');
const SCRIPT = path.join(RAIZ, 'tools', 'actualizar-69b.js');
const DATOS_REALES = path.join(RAIZ, 'data', '69b');
const DEMO = path.join(RAIZ, 'demo', 'Listado_Completo_69-B.csv');
// Copia local de un listado real completo del SAT (variable de entorno LISTADO_69B_REAL).
// Si no se define, las pruebas que la necesitan se omiten.
const REAL = process.env.LISTADO_69B_REAL || '';
const NOMBRE_CSV = 'Listado_completo_69-B.csv';

const temporales = [];

function carpetaTemporal() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listado-69b-test-'));
  temporales.push(dir);
  return dir;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** Huella de una carpeta: nombre, hash y mtime de cada archivo. */
function estado(dir) {
  const huella = {};
  if (!fs.existsSync(dir)) return huella;
  for (const nombre of fs.readdirSync(dir).sort()) {
    const ruta = path.join(dir, nombre);
    const st = fs.statSync(ruta);
    huella[nombre] = st.isFile() ? { sha: sha256(fs.readFileSync(ruta)), mtime: st.mtimeMs } : 'directorio';
  }
  return huella;
}

function sinTemporales(dir) {
  assert.deepEqual(fs.readdirSync(dir).filter(n => n.includes('.tmp-')), [], 'quedaron archivos temporales');
}

/** Ejecuta el script con proceso hijo (ruta y argumentos como arreglo, por los espacios y acentos). */
function correr(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, salida: (r.stdout || '') + (r.stderr || '') };
}

function escribirCopiaPrevia(dir, registros, sha = 'previo') {
  fs.writeFileSync(path.join(dir, NOMBRE_CSV), Buffer.from('copia previa'));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ registros, sha256: sha }, null, 2));
}

const resultados = [];
function prueba(nombre, fn) {
  try {
    fn();
    resultados.push([nombre, true]);
    console.log(`PASS ${nombre}`);
  } catch (e) {
    resultados.push([nombre, false]);
    console.log(`FAIL ${nombre}\n  ${e.message.split('\n').join('\n  ')}`);
  }
}

const antesDatosReales = estado(DATOS_REALES);

if (REAL) assert.ok(fs.existsSync(REAL), `No existe la copia local del listado real: ${REAL}`);
let ESPERADO = null;
if (REAL) {
  require('../js/util.js');
  const R69 = require('../js/lector-csv.js');
  const L = R69.csv.leerListado(R69.csv.decodificar(fs.readFileSync(REAL)));
  ESPERADO = { registros: L.registros.length, renglonEncabezado: L.renglonEncabezado, actualizadoAl: L.actualizadoAl || null };
}
function pruebaReal(nombre, fn) {
  if (!REAL) { console.log(`SKIP ${nombre} (define LISTADO_69B_REAL con la ruta de un listado completo del SAT)`); return; }
  prueba(nombre, fn);
}
assert.ok(fs.existsSync(DEMO), `No existe el CSV de demo: ${DEMO}`);

pruebaReal('listado real: se escriben el CSV (bytes idénticos) y meta.json con sus registros', () => {
  const dir = carpetaTemporal();
  const r = correr(['--archivo', REAL, '--destino', dir]);
  assert.equal(r.code, 0, r.salida);
  const original = fs.readFileSync(REAL);
  const csv = fs.readFileSync(path.join(dir, NOMBRE_CSV));
  assert.ok(csv.equals(original), 'el CSV escrito no es idéntico al original');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  assert.equal(meta.registros, ESPERADO.registros);
  assert.equal(meta.sha256, sha256(original));
  assert.equal(meta.bytes, original.length);
  assert.equal(meta.origen, 'archivo-local');
  assert.equal(meta.fuente, 'SAT – Datos abiertos, Listado completo 69-B');
  assert.equal(meta.renglonEncabezado, ESPERADO.renglonEncabezado);
  assert.equal(meta.actualizadoAl, ESPERADO.actualizadoAl);
  for (const k of ['url', 'ultimaDescargaExitosa', 'lastModifiedSAT', 'etag', 'conteos', 'rfcConVariosEpisodios']) {
    assert.ok(k in meta, `falta el campo ${k} en meta.json`);
  }
  sinTemporales(dir);
});

pruebaReal('segunda ejecución con el mismo archivo: el CSV no cambia y solo se actualiza la fecha de descarga', () => {
  const dir = carpetaTemporal();
  assert.equal(correr(['--archivo', REAL, '--destino', dir]).code, 0);
  const csvAntes = fs.readFileSync(path.join(dir, 'Listado_completo_69-B.csv'));
  const metaAntes = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const r = correr(['--archivo', REAL, '--destino', dir]);
  assert.equal(r.code, 0, r.salida);
  assert.match(r.salida, /Sin cambios en el contenido/);
  assert.ok(fs.readFileSync(path.join(dir, 'Listado_completo_69-B.csv')).equals(csvAntes), 'el CSV debe quedar idéntico');
  const metaDespues = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  assert.equal(metaDespues.sha256, metaAntes.sha256);
  assert.ok(metaDespues.ultimaDescargaExitosa >= metaAntes.ultimaDescargaExitosa);
  assert.equal(metaDespues.contenidoSinCambiosDesde, metaAntes.contenidoSinCambiosDesde, 'conserva desde cuándo no cambia');
  sinTemporales(dir);
});

prueba('demo (241 registros): se RECHAZA con código 1 y no toca los archivos existentes', () => {
  const dir = carpetaTemporal();
  escribirCopiaPrevia(dir, 14234);
  const antes = estado(dir);
  const r = correr(['--archivo', DEMO, '--destino', dir]);
  assert.equal(r.code, 1, r.salida);
  assert.match(r.salida, /241 registros/);
  assert.match(r.salida, /5000/);
  assert.deepEqual(estado(dir), antes, 'los archivos existentes cambiaron');
  sinTemporales(dir);
});

prueba('demo sin copia previa: se rechaza y no crea archivos', () => {
  const dir = carpetaTemporal();
  const r = correr(['--archivo', DEMO, '--destino', dir]);
  assert.equal(r.code, 1, r.salida);
  assert.deepEqual(estado(dir), {}, 'se crearon archivos al rechazar');
});

pruebaReal('caída de más de 20 % frente a meta.json previo: se rechaza y no toca nada', () => {
  const dir = carpetaTemporal();
  escribirCopiaPrevia(dir, Math.ceil(ESPERADO.registros / 0.7));
  const antes = estado(dir);
  const r = correr(['--archivo', REAL, '--destino', dir]);
  assert.equal(r.code, 1, r.salida);
  assert.match(r.salida, /20 %/);
  assert.match(r.salida, new RegExp(String(ESPERADO.registros)));
  assert.deepEqual(estado(dir), antes, 'los archivos existentes cambiaron');
  sinTemporales(dir);
});

pruebaReal('caída menor a 20 % sí se acepta y reemplaza la copia', () => {
  const dir = carpetaTemporal();
  escribirCopiaPrevia(dir, Math.round(ESPERADO.registros * 1.05));
  const r = correr(['--archivo', REAL, '--destino', dir]);
  assert.equal(r.code, 0, r.salida);
  assert.ok(fs.readFileSync(path.join(dir, NOMBRE_CSV)).equals(fs.readFileSync(REAL)));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).registros, ESPERADO.registros);
  sinTemporales(dir);
});

prueba('carpeta real data/69b: no se modificó durante la corrida de pruebas', () => {
  assert.deepEqual(estado(DATOS_REALES), antesDatosReales);
});

for (const dir of temporales) fs.rmSync(dir, { recursive: true, force: true });

const fallidas = resultados.filter(([, ok]) => !ok).length;
console.log(`\n${resultados.length - fallidas} de ${resultados.length} pruebas correctas.`);
if (fallidas) process.exitCode = 1;
