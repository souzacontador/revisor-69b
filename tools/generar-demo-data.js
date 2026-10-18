/* Genera js/demo-data.js con el paquete del caso (CSV en bytes originales Windows-1252 y los XML),
 * para que el modo DEMO funcione incluso abriendo index.html con doble clic (sin servidor).
 * Uso: node tools/generar-demo-data.js */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const demo = path.join(raiz, 'demo');
const csv = fs.readFileSync(path.join(demo, 'Listado_Completo_69-B.csv'));
const leeme = fs.readFileSync(path.join(demo, 'LEEME.txt'), 'utf8');
const cfdi = fs.readdirSync(path.join(demo, 'cfdi')).filter(f => /\.xml$/i.test(f)).sort()
  .map(f => ({ archivo: f, xml: fs.readFileSync(path.join(demo, 'cfdi', f), 'utf8') }));

const salida = '/* Archivo generado por tools/generar-demo-data.js — no editar a mano.\n' +
  ' * Datos ficticios del caso «Revisor de proveedores 69-B» (ver demo/LEEME.txt). */\n' +
  'window.R69_DEMO = ' + JSON.stringify({
    fechaRevision: '2026-09-30',
    archivoListado: 'Listado_Completo_69-B.csv',
    csvBase64: csv.toString('base64'),
    leeme,
    cfdi
  }) + ';\n';
fs.writeFileSync(path.join(raiz, 'js', 'demo-data.js'), salida);
console.log(`js/demo-data.js: ${cfdi.length} CFDI, CSV ${csv.length} bytes, ${(salida.length / 1024).toFixed(0)} KB`);
