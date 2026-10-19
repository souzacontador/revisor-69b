/* Prueba del lector de CFDI que usa la aplicación (js/lector-cfdi.js), con los 40 XML del caso DEMO
 * y XML sintéticos con datos inválidos.
 * Uso: node tests/test-lector-cfdi.js   (requiere: npm install, para @xmldom/xmldom)
 * En el navegador, el lector usa el DOMParser nativo; aquí se usa el de @xmldom/xmldom. */
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let xmldom;
try { xmldom = require('@xmldom/xmldom'); }
catch (e) {
  if (process.env.CI) throw new Error('Falta @xmldom/xmldom: ejecuta npm install.');
  console.log('SKIP test-lector-cfdi (ejecuta npm install para instalar @xmldom/xmldom)');
  process.exit(0);
}
// El DOMParser de xmldom avisa por consola de los errores; aquí basta con que la lectura falle.
globalThis.DOMParser = class extends xmldom.DOMParser { constructor() { super({ onError: () => {} }); } };

require('../js/util.js');
require('../js/dias-habiles.js');
require('../js/lector-csv.js');
require('../js/lector-cfdi.js');
const R69 = require('../js/clasificador.js');
const { leerCFDI } = R69.cfdi;

const raiz = path.join(__dirname, '..');
const dirCFDI = path.join(raiz, 'demo/cfdi');
const archivos = fs.readdirSync(dirCFDI).filter(f => f.endsWith('.xml')).sort();
let pruebas = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pruebas++; };
const igual = (a, b, msg) => { assert.strictEqual(a, b, msg); pruebas++; };

// --- 1. Los 40 CFDI del caso se leen y dan los totales del DEMO ---
const cfdis = archivos.map(f => {
  const r = leerCFDI(fs.readFileSync(path.join(dirCFDI, f), 'utf8'), f);
  ok(r.ok, `${f}: ${r.motivo || ''}`);
  return r.cfdi;
});
igual(cfdis.length, 40, '40 CFDI del caso');
cfdis.forEach(c => igual(c.uuid + '.xml', archivos[cfdis.indexOf(c)], 'UUID del timbre = nombre del archivo'));
const listado = R69.csv.leerListado(R69.csv.decodificar(fs.readFileSync(path.join(raiz, 'demo/Listado_Completo_69-B.csv'))));
const rev = R69.clasificador.revisar(cfdis, listado, { fechaRevision: '2026-09-30', fechaDatos: listado.actualizadoAl });
const cuenta = k => rev.operaciones.filter(o => o.veredicto.clave === k).length;
igual(cuenta('SIN_EFECTO'), 5); igual(cuenta('EN_RIESGO'), 2); igual(cuenta('SIN_RIESGO'), 33);
const comprometido = campo => rev.operaciones.filter(o => o.veredicto.clave !== 'SIN_RIESGO').reduce((s, o) => s + Math.round(o[campo] * 100), 0) / 100;
igual(comprometido('ivaComprometido'), 57088.15, 'IVA comprometido del DEMO');
igual(comprometido('deduccion'), 356800.99, 'Deducción comprometida del DEMO');

// --- 2. XML sintéticos a partir de un CFDI del caso ---
const base = fs.readFileSync(path.join(dirCFDI, archivos[0]), 'utf8');
const attrDe = (xml, nodo, a) => new RegExp('<' + nodo + '\\b[^>]*\\s' + a + '="([^"]*)"').exec(xml)[1];
const conAttr = (xml, nodo, a, valor) => xml.replace(new RegExp('(<' + nodo + '\\b[^>]*\\s' + a + '=")[^"]*(")'), (m, p1, p2) => p1 + valor + p2);
const sinAttr = (xml, nodo, a) => xml.replace(new RegExp('(<' + nodo + '\\b[^>]*)\\s' + a + '="[^"]*"'), '$1');
const conMoneda = (xml, moneda, tc) => xml.replace(/(<cfdi:Comprobante\b)/, `$1 Moneda="${moneda}"${tc == null ? '' : ` TipoCambio="${tc}"`}`)
  .replace(/(<cfdi:Comprobante\b[^>]*?)\sMoneda="MXN"/, '$1');
const rechaza = (xml, patron, msg) => {
  const r = leerCFDI(xml, 'sintetico.xml');
  ok(!r.ok, msg + ': debió rechazarse');
  ok(patron.test(r.motivo), `${msg}: motivo inesperado «${r.motivo}»`);
};

// UUID con HTML: se rechaza (no llega a la interfaz)
const uuidMalo = '"><img src=x onerror=alert(1)>';
rechaza(conAttr(base, 'tfd:TimbreFiscalDigital', 'UUID', uuidMalo.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')), /UUID/, 'UUID con etiquetas');
rechaza(conAttr(base, 'tfd:TimbreFiscalDigital', 'UUID', 'ABC'), /UUID/, 'UUID corto');

// RFC del emisor vacío o mal formado, receptor sin RFC
rechaza(conAttr(base, 'cfdi:Emisor', 'Rfc', ''), /RFC del emisor/, 'RFC del emisor vacío');
rechaza(conAttr(base, 'cfdi:Emisor', 'Rfc', 'XYZ'), /RFC del emisor/, 'RFC del emisor mal formado');
rechaza(sinAttr(base, 'cfdi:Receptor', 'Rfc'), /RFC del receptor/, 'Receptor sin RFC');

// Fecha inexistente o con otro formato
rechaza(conAttr(base, 'cfdi:Comprobante', 'Fecha', '2026-02-30T10:00:00'), /fecha/i, 'Fecha inexistente');
rechaza(conAttr(base, 'cfdi:Comprobante', 'Fecha', '13/01/2026'), /fecha/i, 'Fecha con otro formato');

// Importes inválidos: texto, prefijo numérico, negativo
rechaza(conAttr(base, 'cfdi:Comprobante', 'SubTotal', 'no-es-numero'), /SubTotal/, 'SubTotal no numérico');
rechaza(conAttr(base, 'cfdi:Comprobante', 'SubTotal', '100abc'), /SubTotal/, 'SubTotal con prefijo numérico');
rechaza(conAttr(base, 'cfdi:Comprobante', 'Total', '-5.00'), /Total/, 'Total negativo');

// Moneda extranjera: sin factor, cero, negativo o no numérico → rechazo; 100 USD × 20 = 2,000 MXN
rechaza(conMoneda(base, 'USD', null), /USD sin TipoCambio/, 'USD sin TipoCambio');
rechaza(conMoneda(base, 'USD', '0'), /TipoCambio inválido/, 'USD con TipoCambio cero');
rechaza(conMoneda(base, 'USD', '-20'), /TipoCambio inválido/, 'USD con TipoCambio negativo');
rechaza(conMoneda(base, 'USD', 'veinte'), /TipoCambio inválido/, 'USD con TipoCambio no numérico');
const usd = leerCFDI(conAttr(conMoneda(base, 'USD', '20'), 'cfdi:Comprobante', 'SubTotal', '100.00'), 'usd.xml');
ok(usd.ok, 'USD con TipoCambio 20: ' + (usd.motivo || ''));
igual(usd.cfdi.subtotal, 2000, '100 USD × 20 = 2,000 MXN');
igual(usd.cfdi.subtotalOriginal, 100, 'conserva el importe original');
igual(usd.cfdi.moneda, 'USD'); igual(usd.cfdi.tipoCambio, 20);

// XML mal formado y documentos que no son CFDI
rechaza(base.replace('</cfdi:Comprobante>', ''), /XML|leer/, 'XML mal formado');
rechaza('<?xml version="1.0"?><factura/>', /No es un CFDI/, 'Otro XML');

// El original sigue leyéndose igual (control de las sustituciones)
const control = leerCFDI(base, archivos[0]);
ok(control.ok, 'CFDI base'); igual(control.cfdi.subtotal, Number(attrDe(base, 'cfdi:Comprobante', 'SubTotal')));

// --- 3. Excel de entregables con la DEMO: hojas, trazabilidad e integridad del ZIP (CRC-32) ---
require('../js/exportar-xlsx.js');
require('../js/lector-zip.js');
(async () => {
  const ajustada = rev.operaciones.find(o => o.veredicto.clave === 'SIN_EFECTO');
  const rAj = R69.clasificador.revisar(cfdis, listado, { fechaRevision: '2026-09-30', fechaDatos: listado.actualizadoAl, ajustes: { [ajustada.uuid]: { deduccion: 1000 } } });
  const libro = R69.xlsx.libroEntregables(rAj, {
    contribuyente: 'DEMO', fuenteListado: 'caso', trazabilidad: {
      fechaHora: '18/10/2026 10:00', modo: 'DEMO', version: R69.VERSION, receptor: 'DEMO010101AAA', huella: 'abc123',
      calendario: ['20/07/2026 a 31/07/2026: vacaciones'], isr: 'Sin estimación de ISR',
      ajustes: rAj.operaciones.filter(o => o.ajustado), registro: [['Con error', 'x.xml', 'UUID inválido']]
    }
  });
  const { archivos: partes, omitidos } = await R69.zip.extraerXML(libro, 'entregables.xlsx');
  // Solo se omiten los .rels (no son .xml); ninguna parte falla la verificación CRC-32
  ok(omitidos.length > 0 && omitidos.every(o => /\.rels$/.test(o.nombre)), 'el ZIP del Excel pasa la verificación CRC-32: ' + JSON.stringify(omitidos));
  const texto = n => new TextDecoder().decode(partes.find(p => p.nombre === n).bytes);
  ok(/sheet name="Trazabilidad"/.test(texto('xl/workbook.xml')), 'hoja Trazabilidad');
  const t4 = texto('xl/worksheets/sheet4.xml');
  ['versión ' + R69.VERSION, 'abc123', 'DEMO010101AAA', ajustada.uuid, 'UUID inválido', '20/07/2026'].forEach(x => ok(t4.includes(x), 'Trazabilidad incluye ' + x));
  console.log(`OK — ${pruebas} comprobaciones del lector de CFDI y del Excel pasaron.`);
})().catch(e => { console.error(e); process.exit(1); });
