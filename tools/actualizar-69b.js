#!/usr/bin/env node
/* Actualiza el listado del artículo 69-B del SAT para la app web (sin servidor).
 *
 * Uso:
 *   node tools/actualizar-69b.js                       descarga la copia oficial del SAT
 *   node tools/actualizar-69b.js --archivo <ruta>      usa un archivo local en lugar de descargar (pruebas)
 *   node tools/actualizar-69b.js --destino <carpeta>   carpeta de salida (por defecto data/69b, en la raíz del proyecto)
 *
 * Reglas:
 *  - Valida antes de sustituir. Si la descarga o la validación fallan, no toca los archivos
 *    existentes y termina con código 1, para conservar la última versión válida.
 *  - El CSV se guarda con los bytes originales (sin recodificar), así su SHA-256 coincide con el del SAT.
 *  - Si el contenido es idéntico a la copia actual (mismo SHA-256), no escribe nada.
 *  - Las rutas de --archivo y --destino se resuelven desde la carpeta desde la que se ejecuta el comando.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Módulos compartidos con la app del navegador. util.js debe cargarse primero.
require('../js/util.js');
const R69 = require('../js/lector-csv.js');

const URL_OFICIAL = 'https://wu1agsprosta001.blob.core.windows.net/agsc-publicaciones/Datos_abiertos/Documents_AGAFF/Listado_completo_69-B.csv';
const FUENTE = 'SAT – Datos abiertos, Listado completo 69-B';
const NOMBRE_CSV = 'Listado_completo_69-B.csv';
const NOMBRE_META = 'meta.json';
const RAIZ = path.resolve(__dirname, '..');
const DESTINO_DEFECTO = path.join(RAIZ, 'data', '69b');
const MINIMO_REGISTROS = 5000;
const CAIDA_MAXIMA = 0.20;          // más de 20 % menos registros que la copia actual se rechaza
const INTENTOS = 3;
const TIMEOUT_MS = 120000;
const ESPERA_BASE_MS = 10000;       // espera entre intentos: 10 s, 20 s...
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const esperar = ms => new Promise(resolver => setTimeout(resolver, ms));

function mensajeError(e) {
  if (!e) return 'error desconocido';
  const causa = e.cause ? ` (${e.cause.message || e.cause})` : '';
  return (e.message || String(e)) + causa;
}

/** Lee --archivo y --destino, con formato "--opcion valor" o "--opcion=valor". */
function leerArgumentos(argv) {
  const op = { archivo: null, destino: DESTINO_DEFECTO };
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(archivo|destino)(?:=(.*))?$/.exec(argv[i]);
    if (!m) throw new Error(`Argumento no reconocido: ${argv[i]}`);
    const valor = m[2] !== undefined ? m[2] : argv[++i];
    if (!valor) throw new Error(`Falta el valor de --${m[1]}.`);
    if (m[1] === 'archivo') op.archivo = valor;
    else op.destino = path.resolve(valor);
  }
  return op;
}

/** Descarga el CSV oficial con hasta INTENTOS intentos. Devuelve bytes y encabezados HTTP de interés. */
async function descargar() {
  let ultimo = null;
  for (let intento = 1; intento <= INTENTOS; intento++) {
    console.log(`Descargando del SAT (intento ${intento} de ${INTENTOS})...`);
    try {
      const res = await fetch(URL_OFICIAL, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv,text/plain,*/*;q=0.8' },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`respuesta HTTP ${res.status} ${res.statusText}`.trim());
      const bytes = Buffer.from(await res.arrayBuffer());
      return { bytes, lastModified: res.headers.get('last-modified') || null, etag: res.headers.get('etag') || null };
    } catch (e) {
      ultimo = e;
      console.log(`  Falló: ${mensajeError(e)}`);
      if (intento < INTENTOS) await esperar(ESPERA_BASE_MS * intento);
    }
  }
  throw new Error(`No se pudo descargar el listado tras ${INTENTOS} intentos. Último error: ${mensajeError(ultimo)}`);
}

/** Lee, valida y compara con la copia anterior. Lanza Error con el motivo si no debe sustituirse. */
function validarBytes(bytes, previo) {
  let listado;
  try {
    listado = R69.csv.leerListado(R69.csv.decodificar(bytes));
  } catch (e) {
    throw new Error(`el archivo no tiene el formato del listado 69-B: ${e.message}`);
  }
  const v = R69.csv.validarListado(listado, { minimoRegistros: MINIMO_REGISTROS });
  if (!v.ok) throw new Error(`la validación no pasó: ${v.errores.join(' ')}`);

  const n = listado.registros.length;
  if (previo && previo.registros > 0) {
    const caida = (previo.registros - n) / previo.registros;
    if (caida > CAIDA_MAXIMA) {
      throw new Error(`el listado nuevo tiene ${n} registros y la copia actual ${previo.registros}: ` +
        `una caída de ${(caida * 100).toFixed(1)} % supera el límite de 20 % (posible descarga truncada).`);
    }
  }
  return listado;
}

/** meta.json de la copia actual, o null si no existe o no se puede leer. */
function leerMetaPrevio(destino) {
  const ruta = path.join(destino, NOMBRE_META);
  if (!fs.existsSync(ruta)) return null;
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    console.log(`Aviso: ${NOMBRE_META} actual no se puede leer (${e.message}); no se compara con la copia anterior.`);
    return null;
  }
}

function construirMeta(listado, bytes, datos) {
  return {
    fuente: FUENTE,
    url: URL_OFICIAL,
    ultimaDescargaExitosa: new Date().toISOString(),
    lastModifiedSAT: datos.lastModified,
    etag: datos.etag,
    actualizadoAl: listado.actualizadoAl || null,
    registros: listado.registros.length,
    conteos: listado.conteos,
    rfcConVariosEpisodios: listado.rfcConVariosEpisodios,
    renglonEncabezado: listado.renglonEncabezado,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    origen: datos.origen
  };
}

function leerSiExiste(ruta) {
  return fs.existsSync(ruta) ? fs.readFileSync(ruta) : null;
}

/** Escribe a temporales y luego renombra. Si un renombrado falla, deshace el CSV para no dejar una mezcla. */
function escribirListado(destino, bytes, meta) {
  fs.mkdirSync(destino, { recursive: true });
  const rutaCsv = path.join(destino, NOMBRE_CSV);
  const rutaMeta = path.join(destino, NOMBRE_META);
  const sufijo = `.tmp-${process.pid}-${Date.now()}`;
  const tmpCsv = rutaCsv + sufijo;
  const tmpMeta = rutaMeta + sufijo;
  const anterior = { csv: leerSiExiste(rutaCsv) };
  let csvCambiado = false;
  try {
    fs.writeFileSync(tmpCsv, bytes);
    fs.writeFileSync(tmpMeta, JSON.stringify(meta, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpCsv, rutaCsv);
    csvCambiado = true;
    fs.renameSync(tmpMeta, rutaMeta);
  } catch (e) {
    try {
      if (csvCambiado) {
        if (anterior.csv) fs.writeFileSync(rutaCsv, anterior.csv);
        else fs.rmSync(rutaCsv, { force: true });
      }
    } catch (_) { /* restauración en el mejor esfuerzo; el error original se reporta abajo */ }
    throw e;
  } finally {
    fs.rmSync(tmpCsv, { force: true });
    fs.rmSync(tmpMeta, { force: true });
  }
}

function imprimirResumen(meta, listado, destino) {
  const f = n => Number(n).toLocaleString('es-MX');
  const conteos = Object.entries(meta.conteos).map(([k, v]) => `${k} ${f(v)}`).join(' · ');
  console.log('');
  console.log('Listado 69-B actualizado');
  console.log(`  Origen:                   ${meta.origen === 'descarga' ? 'descarga del SAT' : 'archivo local'}`);
  console.log(`  Actualizado al:           ${meta.actualizadoAl || 'sin dato'}`);
  console.log(`  Registros:                ${f(meta.registros)} (encabezado en el renglón ${meta.renglonEncabezado})`);
  console.log(`  Situaciones:              ${conteos}`);
  console.log(`  RFC con varios episodios: ${f(meta.rfcConVariosEpisodios)}`);
  console.log(`  Advertencias (no bloquean): ${f(listado.advertencias.length)}`);
  listado.advertencias.slice(0, 3).forEach(a => console.log(`    - ${a}`));
  console.log(`  SHA-256:                  ${meta.sha256}`);
  console.log(`  Bytes:                    ${f(meta.bytes)}`);
  console.log(`  Carpeta:                  ${destino}`);
}

async function main() {
  const op = leerArgumentos(process.argv.slice(2));
  const destino = op.destino;
  let datos;
  if (op.archivo) {
    const ruta = path.resolve(op.archivo);
    console.log(`Usando archivo local: ${ruta}`);
    datos = { bytes: fs.readFileSync(ruta), lastModified: null, etag: null, origen: 'archivo-local' };
  } else {
    console.log(`Fuente: ${URL_OFICIAL}`);
    datos = { ...(await descargar()), origen: 'descarga' };
  }
  console.log(`Recibidos ${datos.bytes.length.toLocaleString('es-MX')} bytes. Validando...`);

  const previo = leerMetaPrevio(destino);
  const listado = validarBytes(datos.bytes, previo);
  const meta = construirMeta(listado, datos.bytes, datos);

  // Contenido idéntico a la copia actual: el CSV no se reescribe, pero sí se registra en meta.json
  // la fecha de esta descarga exitosa (la app la muestra) y desde cuándo no cambia el contenido.
  if (previo && previo.sha256 === meta.sha256 && fs.existsSync(path.join(destino, NOMBRE_CSV))) {
    meta.contenidoSinCambiosDesde = previo.contenidoSinCambiosDesde || previo.ultimaDescargaExitosa || meta.ultimaDescargaExitosa;
    const rutaMeta = path.join(destino, NOMBRE_META);
    const tmpMeta = rutaMeta + `.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpMeta, JSON.stringify(meta, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpMeta, rutaMeta);
    console.log(`Sin cambios en el contenido (SHA-256 ${meta.sha256}). Solo se actualizó la fecha de la última descarga exitosa en ${NOMBRE_META}.`);
    return;
  }
  meta.contenidoSinCambiosDesde = meta.ultimaDescargaExitosa;

  escribirListado(destino, datos.bytes, meta);
  imprimirResumen(meta, listado, destino);
}

main().catch(e => {
  console.error(`\nERROR: ${mensajeError(e)}`);
  console.error('No se sustituyó la copia existente en la carpeta de destino.');
  process.exitCode = 1;
});
