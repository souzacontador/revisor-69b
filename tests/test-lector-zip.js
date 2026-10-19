'use strict';
/* Pruebas de js/lector-zip.js. Node 22: node tests/test-lector-zip.js
 * - Las pruebas con Compress-Archive solo corren en Windows (usan PowerShell).
 * - Las demás construyen ZIP en memoria con un escritor mínimo, así corren en cualquier sistema. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const R69 = require(path.join(RAIZ, 'js', 'lector-zip.js'));
const extraerXML = R69.zip.extraerXML;
const DEMO = path.join(RAIZ, 'demo', 'cfdi');
const ES_WINDOWS = process.platform === 'win32';
const SKIP_PS = ES_WINDOWS ? false : 'requiere Windows (Compress-Archive)';

/* ---------- utilidades ---------- */

/** Crea un ZIP con Windows PowerShell (Compress-Archive). Rutas entre comillas simples, sin ventana de progreso. */
function comprimirPS(origen, destino) {
  const q = (s) => "'" + s.replace(/'/g, "''") + "'";
  const orden = "$ProgressPreference='SilentlyContinue'; " +
    'Compress-Archive -Path ' + q(origen) + ' -DestinationPath ' + q(destino) + ' -Force';
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', orden],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
}

/**
 * Escritor mínimo de ZIP para pruebas. Cada entrada:
 *   { nombre, datos (Buffer), metodo: 0|8|99, dataDescriptor, cifrado, tam64, comprimidoCrudo, utf8, crcMalo }
 * - dataDescriptor: el encabezado local lleva ceros y los tamaños van tras los datos (bit 3).
 * - tam64: el directorio central marca 0xFFFFFFFF en tamaños (simula ZIP64).
 * - comprimidoCrudo: bytes comprimidos tal cual (para simular deflate corrupto).
 */
function construirZip(entradas, comentario) {
  const cuerpo = [];
  const centrales = [];
  let pos = 0;
  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, 'utf8');
    const metodo = e.metodo === undefined ? 0 : e.metodo;
    let comp;
    if (e.comprimidoCrudo) comp = Buffer.from(e.comprimidoCrudo);
    else if (metodo === 8) comp = zlib.deflateRawSync(e.datos);
    else comp = Buffer.from(e.datos);
    const dd = !!e.dataDescriptor;
    const banderas = (dd ? 0x0008 : 0) | (e.cifrado ? 0x0001 : 0) | (e.utf8 ? 0x0800 : 0);
    const usize = e.datos.length;
    const crc = e.crcMalo ? (zlib.crc32(e.datos) ^ 1) >>> 0 : zlib.crc32(e.datos);

    const cab = Buffer.alloc(30);
    cab.writeUInt32LE(0x04034b50, 0);
    cab.writeUInt16LE(20, 4);
    cab.writeUInt16LE(banderas, 6);
    cab.writeUInt16LE(metodo, 8);
    cab.writeUInt32LE(dd ? 0 : crc, 14);
    cab.writeUInt32LE(dd ? 0 : comp.length, 18);
    cab.writeUInt32LE(dd ? 0 : usize, 22);
    cab.writeUInt16LE(nombre.length, 26);

    const offsetEntrada = pos;
    cuerpo.push(cab, nombre, comp);
    pos += 30 + nombre.length + comp.length;
    if (dd) {
      const dsc = Buffer.alloc(16);
      dsc.writeUInt32LE(0x08074b50, 0);
      dsc.writeUInt32LE(crc, 4);
      dsc.writeUInt32LE(comp.length, 8);
      dsc.writeUInt32LE(usize, 12);
      cuerpo.push(dsc);
      pos += 16;
    }

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(banderas, 8);
    cd.writeUInt16LE(metodo, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(e.tam64 ? 0xFFFFFFFF : comp.length, 20);
    cd.writeUInt32LE(e.tam64 ? 0xFFFFFFFF : usize, 24);
    cd.writeUInt16LE(nombre.length, 28);
    cd.writeUInt32LE(offsetEntrada, 42);
    centrales.push(cd, nombre);
  }
  const inicioCD = pos;
  const cdBuf = Buffer.concat(centrales);
  const coment = comentario ? Buffer.from(comentario, 'latin1') : Buffer.alloc(0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entradas.length, 8);
  eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(inicioCD, 16);
  eocd.writeUInt16LE(coment.length, 20);
  return Buffer.concat([...cuerpo, cdBuf, eocd, coment]);
}

/** Nombre de archivo -> bytes, para fijar el contenido de cada XML de prueba. */
function xmlDe(texto) { return Buffer.from('<?xml version="1.0"?><raiz>' + texto + '</raiz>', 'utf8'); }

function nombres(lista) { return lista.map((x) => x.nombre).sort(); }

let tmp;
test.before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lector-zip-')); });
test.after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

/* ---------- pruebas con Compress-Archive (Windows) ---------- */

test('(a) ZIP real con los 40 XML de demo/cfdi: 40 archivos con bytes idénticos', { skip: SKIP_PS }, async () => {
  const zipPath = path.join(tmp, 'demo-cfdi.zip');
  comprimirPS(path.join(DEMO, '*'), zipPath);
  const originales = fs.readdirSync(DEMO).filter((n) => n.toLowerCase().endsWith('.xml'));
  assert.strictEqual(originales.length, 40, 'la carpeta demo debe tener 40 XML');

  const { archivos, omitidos } = await extraerXML(fs.readFileSync(zipPath), 'demo-cfdi.zip');
  assert.strictEqual(archivos.length, 40);
  assert.deepStrictEqual(omitidos, []);
  const porNombre = new Map(archivos.map((a) => [a.nombre, a.bytes]));
  for (const n of originales) {
    const bytes = porNombre.get(n);
    assert.ok(bytes instanceof Uint8Array, 'falta ' + n);
    assert.strictEqual(Buffer.compare(Buffer.from(bytes), fs.readFileSync(path.join(DEMO, n))), 0, 'bytes distintos en ' + n);
  }
});

test('(b) ZIP real con subcarpeta, .txt y ZIP anidado', { skip: SKIP_PS }, async () => {
  const stage = path.join(tmp, 'stage');
  const interno = path.join(stage, 'interno-src', 'carpeta');
  const externo = path.join(stage, 'externo', 'carpeta');
  fs.mkdirSync(interno, { recursive: true });
  fs.mkdirSync(externo, { recursive: true });
  const xmls = fs.readdirSync(DEMO).filter((n) => n.toLowerCase().endsWith('.xml')).sort();
  fs.copyFileSync(path.join(DEMO, xmls[0]), path.join(interno, 'b.xml'));
  fs.copyFileSync(path.join(DEMO, xmls[1]), path.join(externo, 'a.xml'));
  fs.writeFileSync(path.join(stage, 'externo', 'nota.txt'), 'hola');
  comprimirPS(path.join(stage, 'interno-src', '*'), path.join(stage, 'interno.zip'));
  fs.copyFileSync(path.join(stage, 'interno.zip'), path.join(stage, 'externo', 'interno.zip'));
  const zipPath = path.join(tmp, 'externo.zip');
  comprimirPS(path.join(stage, 'externo', '*'), zipPath);

  const { archivos, omitidos } = await extraerXML(fs.readFileSync(zipPath), 'externo.zip');
  assert.deepStrictEqual(nombres(archivos), ['carpeta/a.xml', 'interno.zip/carpeta/b.xml']);
  const b = archivos.find((a) => a.nombre === 'interno.zip/carpeta/b.xml');
  assert.strictEqual(Buffer.compare(Buffer.from(b.bytes), fs.readFileSync(path.join(DEMO, xmls[0]))), 0);
  assert.deepStrictEqual(omitidos.map((o) => o.nombre), ['nota.txt']);
  assert.match(omitidos[0].motivo, /no es XML/);
});

/* ---------- pruebas con ZIP construidos en memoria ---------- */

test('stored y deflate con data descriptor (bit 3): tamaños del directorio central', async () => {
  const datosA = xmlDe('uno');
  const datosB = xmlDe('dos dos dos dos dos dos dos');
  const datosC = xmlDe('tres');
  const zip = construirZip([
    { nombre: 's.xml', datos: datosA, metodo: 0 },
    { nombre: 'd/d.XML', datos: datosB, metodo: 8, dataDescriptor: true },
    { nombre: 'x.xml', datos: datosC, metodo: 0, dataDescriptor: true }
  ]);
  const { archivos, omitidos } = await extraerXML(zip, 'mezcla.zip');
  assert.deepStrictEqual(omitidos, []);
  assert.deepStrictEqual(nombres(archivos), ['d/d.XML', 's.xml', 'x.xml']);
  const porNombre = new Map(archivos.map((a) => [a.nombre, Buffer.from(a.bytes)]));
  assert.ok(porNombre.get('s.xml').equals(datosA));
  assert.ok(porNombre.get('d/d.XML').equals(datosB));
  assert.ok(porNombre.get('x.xml').equals(datosC));
});

test('omite carpetas y basura de macOS; reporta cifradas, método no soportado, ZIP64 y no XML', async () => {
  const zip = construirZip([
    { nombre: 'carpeta/', datos: Buffer.alloc(0) },
    { nombre: '__MACOSX/carpeta/._a.xml', datos: xmlDe('basura') },
    { nombre: 'carpeta/._b.xml', datos: xmlDe('basura') },
    { nombre: 'ok.xml', datos: xmlDe('ok') },
    { nombre: 'cifrado.xml', datos: xmlDe('x'), cifrado: true },
    { nombre: 'metodo.xml', datos: xmlDe('x'), metodo: 99 },
    { nombre: 'grande.xml', datos: xmlDe('x'), tam64: true },
    { nombre: 'nota.txt', datos: Buffer.from('texto') }
  ]);
  const { archivos, omitidos } = await extraerXML(zip, 'mixto.zip');
  assert.deepStrictEqual(nombres(archivos), ['ok.xml']);
  const motivos = Object.fromEntries(omitidos.map((o) => [o.nombre, o.motivo]));
  assert.deepStrictEqual(Object.keys(motivos).sort(), ['cifrado.xml', 'grande.xml', 'metodo.xml', 'nota.txt']);
  assert.match(motivos['cifrado.xml'], /cifrada/);
  assert.match(motivos['metodo.xml'], /método de compresión no soportado \(99\)/);
  assert.match(motivos['grande.xml'], /ZIP64/);
  assert.match(motivos['nota.txt'], /no es XML/);
});

test('ZIP anidado: rutas con prefijo y límite de profundidad 2', async () => {
  const nivel3 = construirZip([{ nombre: 'c.xml', datos: xmlDe('c') }]);
  const nivel2 = construirZip([
    { nombre: 'x.xml', datos: xmlDe('x') },
    { nombre: 'n3.zip', datos: nivel3, metodo: 8 }
  ]);
  const nivel1 = construirZip([
    { nombre: 'y.xml', datos: xmlDe('y') },
    { nombre: 'carpeta/n2.zip', datos: nivel2, metodo: 8 }
  ]);
  const zip = construirZip([{ nombre: 'n1.zip', datos: nivel1, metodo: 8 }]);
  const { archivos, omitidos } = await extraerXML(zip, 'raiz.zip');
  assert.deepStrictEqual(nombres(archivos), ['n1.zip/carpeta/n2.zip/x.xml', 'n1.zip/y.xml']);
  assert.deepStrictEqual(omitidos.map((o) => o.nombre), ['n1.zip/carpeta/n2.zip/n3.zip']);
  assert.match(omitidos[0].motivo, /profundidad de anidamiento excedida/);
});

test('ZIP anidado dañado no tumba al ZIP principal', async () => {
  const basura = Buffer.from('esto no es un zip, solo texto de relleno');
  const zip = construirZip([
    { nombre: 'ok.xml', datos: xmlDe('ok') },
    { nombre: 'roto.zip', datos: basura, metodo: 0 }
  ]);
  const { archivos, omitidos } = await extraerXML(zip, 'con-roto.zip');
  assert.deepStrictEqual(nombres(archivos), ['ok.xml']);
  assert.strictEqual(omitidos[0].nombre, 'roto.zip');
  assert.match(omitidos[0].motivo, /ZIP anidado no válido/);
});

test('deflate corrupto va a omitidos sin rechazar el ZIP', async () => {
  const zip = construirZip([
    { nombre: 'bueno.xml', datos: xmlDe('bueno'), metodo: 8 },
    // 0x07: bloque deflate de tipo reservado (inválido)
    { nombre: 'malo.xml', datos: xmlDe('malo'), metodo: 8, comprimidoCrudo: Buffer.from([0x07, 0xff, 0xff, 0x00]) }
  ]);
  const { archivos, omitidos } = await extraerXML(zip, 'corrupto.zip');
  assert.deepStrictEqual(nombres(archivos), ['bueno.xml']);
  assert.strictEqual(omitidos[0].nombre, 'malo.xml');
  assert.match(omitidos[0].motivo, /descompresión/);
});

test('comentario del ZIP con la firma EOCD dentro del comentario', async () => {
  const zip = construirZip([{ nombre: 'a.xml', datos: xmlDe('a') }], 'PK\u0005\u0006 comentario de relleno PK\u0005\u0006');
  const { archivos } = await extraerXML(zip, 'comentado.zip');
  assert.deepStrictEqual(nombres(archivos), ['a.xml']);
});

test('acepta Uint8Array con offset (vista sobre un búfer mayor) y ArrayBuffer', async () => {
  const zip = construirZip([{ nombre: 'a.xml', datos: xmlDe('a'), metodo: 8 }]);
  const grande = Buffer.concat([Buffer.alloc(13, 0xAA), zip, Buffer.alloc(7, 0xBB)]);
  const vista = new Uint8Array(grande.buffer, grande.byteOffset + 13, zip.length);
  const r1 = await extraerXML(vista, 'vista.zip');
  assert.deepStrictEqual(nombres(r1.archivos), ['a.xml']);
  const ab = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length);
  const r2 = await extraerXML(ab, 'ab.zip');
  assert.deepStrictEqual(nombres(r2.archivos), ['a.xml']);
});

test('datos que no son ZIP: la promesa se rechaza con mensaje en español', async () => {
  await assert.rejects(extraerXML(Buffer.from('esto no es un zip'), 'texto.txt'),
    (err) => err instanceof Error && /no es un ZIP válido/.test(err.message) && /texto\.txt/.test(err.message));
  await assert.rejects(extraerXML(new Uint8Array(100), 'ceros.bin'), /no es un ZIP válido/);
  await assert.rejects(extraerXML(new Uint8Array(0)), /no es un ZIP válido/);
});

test('nombres: bit 11 activo decodifica UTF-8', async () => {
  const zip = construirZip([{ nombre: 'Ñandú/niño.xml', datos: xmlDe('n'), utf8: true }]);
  const { archivos } = await extraerXML(zip);
  assert.deepStrictEqual(nombres(archivos), ['Ñandú/niño.xml']);
});

test('CRC-32 que no coincide: la entrada va a omitidos como dañada', async () => {
  const zip = construirZip([
    { nombre: 'bien.xml', datos: xmlDe('ok'), metodo: 8 },
    { nombre: 'danado.xml', datos: xmlDe('x'), metodo: 0, crcMalo: true }
  ]);
  const { archivos, omitidos } = await extraerXML(zip);
  assert.deepStrictEqual(nombres(archivos), ['bien.xml']);
  assert.strictEqual(omitidos.length, 1);
  assert.match(omitidos[0].motivo, /CRC-32/);
});

test('topes por carga: archivos y bytes, compartidos entre ZIP y anidados', async () => {
  const tres = construirZip([1, 2, 3].map(i => ({ nombre: `f${i}.xml`, datos: xmlDe('n' + i) })));
  // Tope de archivos: 2 → el tercero detiene la carga con err.limite
  const c1 = R69.zip.nuevoContador({ archivos: 2, bytes: 1e9 });
  await assert.rejects(extraerXML(tres, 'tres.zip', c1), e => e.limite === true && /2 archivos XML/.test(e.message));
  // El contador se comparte: dos ZIP de 3 archivos con tope de 5
  const c2 = R69.zip.nuevoContador({ archivos: 5, bytes: 1e9 });
  await extraerXML(tres, 'a.zip', c2);
  await assert.rejects(extraerXML(tres, 'b.zip', c2), e => e.limite === true);
  // Tope de bytes: cuenta también el ZIP anidado
  const anidado = construirZip([{ nombre: 'interno.zip', datos: tres }]);
  const c3 = R69.zip.nuevoContador({ archivos: 100, bytes: tres.length + 10 });
  await assert.rejects(extraerXML(anidado, 'anidado.zip', c3), e => e.limite === true && /MB/.test(e.message));
  // Dentro de los topes, todo se lee
  const c4 = R69.zip.nuevoContador();
  const r = await extraerXML(anidado, 'anidado.zip', c4);
  assert.strictEqual(r.archivos.length, 3);
  assert.strictEqual(c4.archivos, 3);
});
