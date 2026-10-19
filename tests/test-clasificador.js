/* Prueba del clasificador y de los días hábiles con el caso DEMO.
 * Uso: node tests/test-clasificador.js
 * Los CFDI se leen con una extracción simple por expresiones regulares (solo para la prueba en Node;
 * la app usa DOMParser en el navegador). */
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
require('../js/util.js');
require('../js/dias-habiles.js');
require('../js/lector-csv.js');
const R69 = require('../js/clasificador.js');
const U = R69.util;

const raiz = path.join(__dirname, '..');
const listado = R69.csv.leerListado(R69.csv.decodificar(fs.readFileSync(path.join(raiz, 'demo/Listado_Completo_69-B.csv'))));

const attr = (xml, nodo, a) => { const m = new RegExp('<' + nodo + '\\b[^>]*\\s' + a + '="([^"]*)"').exec(xml); return m ? m[1] : ''; };
const cfdis = fs.readdirSync(path.join(raiz, 'demo/cfdi')).filter(f => f.endsWith('.xml')).map(f => {
  const x = fs.readFileSync(path.join(raiz, 'demo/cfdi', f), 'utf8');
  const imp = /<cfdi:Impuestos TotalImpuestosTrasladados[^>]*>[\s\S]*?<\/cfdi:Impuestos>\s*(<cfdi:Complemento|<\/cfdi:Comprobante)/.exec(x);
  const iva = imp ? [...imp[0].matchAll(/<cfdi:Traslado\b[^>]*Impuesto="002"[^>]*Importe="([\d.]+)"/g)].reduce((s, m) => s + +m[1], 0) : 0;
  return {
    archivo: f, uuid: attr(x, 'tfd:TimbreFiscalDigital', 'UUID').toUpperCase(), fecha: attr(x, 'cfdi:Comprobante', 'Fecha').slice(0, 10),
    emisorRFC: U.normalizarRFC(attr(x, 'cfdi:Emisor', 'Rfc')), emisorNombre: attr(x, 'cfdi:Emisor', 'Nombre'),
    subtotal: +attr(x, 'cfdi:Comprobante', 'SubTotal'), descuento: +attr(x, 'cfdi:Comprobante', 'Descuento') || 0,
    total: +attr(x, 'cfdi:Comprobante', 'Total'), ivaTrasladado: iva, moneda: 'MXN'
  };
});

// --- Días hábiles (art. 12 CFF) ---
assert.deepStrictEqual([...R69.dias.inhabilesArt12(2026).keys()].sort(),
  ['2026-01-01', '2026-02-02', '2026-03-16', '2026-05-01', '2026-05-05', '2026-09-16', '2026-11-16', '2026-12-25']);
assert.strictEqual(R69.dias.inhabilesArt12(2030).has('2030-12-01'), true, '1 de diciembre cada 6 años');
assert.strictEqual(R69.dias.motivoInhabil('2026-10-12'), '', '12 de octubre es hábil');
assert.strictEqual(R69.dias.plazoHabil('2026-01-22', 30).vence, '2026-03-06');
assert.strictEqual(R69.dias.plazoHabil('2026-09-04', 30).vence, '2026-10-19');

// --- Revisión completa ---
const r = R69.clasificador.revisar(cfdis, listado, { fechaRevision: '2026-09-30', fechaDatos: listado.actualizadoAl });
assert.strictEqual(cfdis.length, 40);
const cuenta = k => r.operaciones.filter(o => o.veredicto.clave === k).length;
assert.strictEqual(cuenta('SIN_EFECTO'), 5);
assert.strictEqual(cuenta('EN_RIESGO'), 2);
assert.strictEqual(cuenta('SIN_RIESGO'), 33);
assert.strictEqual(cuenta('REVISION'), 0);
assert.strictEqual(r.proveedores.length, 5);

const prov = rfc => r.proveedores.find(p => p.rfc === rfc);
assert.strictEqual(prov('CAV170905R14').plazo.vence, '2026-03-06');
assert.strictEqual(prov('CAV170905R14').plazo.estado, 'VENCIDO');
assert.strictEqual(prov('LIC150611K27').plazo.vence, '2026-10-19');
assert.strictEqual(prov('LIC150611K27').plazo.estado, 'VIGENTE');
assert.strictEqual(prov('SAL180417HT3').situacion, 'Presunto', 'RFC con espacio en el listado');
assert.strictEqual(prov('PEH160228QX5').veredicto.clave, 'SIN_RIESGO');
assert.strictEqual(prov('STN140709BB6').veredicto.clave, 'SIN_RIESGO');
// Trampa de nombres: LIC190322P81 no está listado aunque su nombre se parece
const lic19 = r.operaciones.filter(o => o.rfc === 'LIC190322P81');
assert.ok(lic19.length === 3 && lic19.every(o => o.veredicto.clave === 'SIN_RIESGO' && o.nota.includes('LIC150611K27')));
// Trampa del «ni produjeron»: facturas anteriores al definitivo siguen sin efecto
assert.ok(r.operaciones.filter(o => o.rfc === 'LIC150611K27').every(o => o.veredicto.clave === 'SIN_EFECTO' && o.posteriorADefinitivo === false));

// --- Casos límite con un listado sintético (criterios fijados por el titular) ---
const ep = (renglon, situacion, def, sent) => ({
  renglon, nombre: 'PROVEEDOR SINTETICO', situacion, situacionCruda: situacion,
  presunto: { fechaSAT: '2025-01-10', fechaDOF: '2025-01-10' }, desvirtuado: {},
  definitivo: def || {}, sentencia: sent || {}
});
const sintetico = {
  registros: [], porRFC: new Map([
    ['AAA010101AA1', [ep(1, 'Definitivo', { fechaSAT: '2026-08-03', fechaDOF: '' })]],
    ['BBB010101BB2', [ep(2, 'Definitivo', { fechaSAT: '2024-02-01', fechaDOF: '2024-02-01' }), ep(3, 'Sentencia Favorable', { fechaSAT: '2024-02-01', fechaDOF: '2024-02-01' }, { fechaSAT: '2025-05-01', fechaDOF: '2025-05-02' })]],
    ['CCC010101CC3', [ep(4, 'Definitivo', { fechaSAT: '2017-11-21', fechaDOF: '2017-11-21' }), ep(5, 'Definitivo', { fechaSAT: '2021-11-04', fechaDOF: '2021-11-04' })]]
  ])
};
sintetico.porRFC.forEach(l => l.forEach(x => sintetico.registros.push(Object.assign({ rfc: '' }, x))));
const cf = (rfc, uuid, sub, iva) => ({ uuid, emisorRFC: rfc, emisorNombre: 'PROVEEDOR ' + rfc, fecha: '2026-05-01', subtotal: sub, descuento: 0, ivaTrasladado: iva, total: sub + iva });
const rs = R69.clasificador.revisar([
  cf('AAA010101AA1', 'U1', 1000, 160), cf('BBB010101BB2', 'U2', 2000, 320),
  cf('CCC010101CC3', 'U3', 3000, 480), cf('CCC010101CC3', 'U4', 500, 80), cf('ZZZ010101ZZ9', 'U5', 100, 16)
], sintetico, { fechaRevision: '2026-09-30', fechaDatos: '30/09/2026' });
const ps = rfc => rs.proveedores.find(p => p.rfc === rfc);
// Definitivo sin fecha DOF: no se calcula vencimiento
assert.strictEqual(ps('AAA010101AA1').plazo.estado, 'PENDIENTE_DOF');
assert.strictEqual(ps('AAA010101AA1').plazo.vence, undefined);
assert.strictEqual(ps('AAA010101AA1').fechaLimite, 'Pendiente de verificar publicación en DOF');
// Episodios contradictorios: revisión documental, sin estado único
assert.strictEqual(ps('BBB010101BB2').veredicto.clave, 'REVISION');
assert.strictEqual(ps('BBB010101BB2').episodios.length, 2);
// Dos episodios con la misma situación: los importes se cuentan una sola vez
assert.strictEqual(ps('CCC010101CC3').veredicto.clave, 'SIN_EFECTO');
assert.strictEqual(ps('CCC010101CC3').cfdis, 2);
assert.strictEqual(ps('CCC010101CC3').ivaComprometido, 560);
assert.strictEqual(ps('CCC010101CC3').deduccion, 3500);
assert.ok(ps('CCC010101CC3').fechaLimite.startsWith('Requiere revisión documental'));
// RFC no encontrado: texto fijado por el titular, con la fecha de los datos
const z = rs.operaciones.find(o => o.rfc === 'ZZZ010101ZZ9');
assert.strictEqual(z.motivo, 'RFC no encontrado en el listado consultado (datos al 30/09/2026).');
// Ajuste manual del importe deducido
const ra = R69.clasificador.revisar([cf('CCC010101CC3', 'U3', 3000, 480)], sintetico, { fechaRevision: '2026-09-30', ajustes: { U3: { deduccion: 1200, iva: 0 } } });
assert.strictEqual(ra.proveedores[0].deduccion, 1200);
assert.strictEqual(ra.proveedores[0].ivaComprometido, 0);

// --- Primer periodo de vacaciones 2026 del SAT (regla 2.1.6, fr. III: 20 al 31 de julio) ---
assert.strictEqual(R69.dias.plazoHabil('2026-07-01', 30).vence, '2026-08-26', 'plazo que cruza las vacaciones de julio');
assert.strictEqual(R69.dias.motivoInhabil('2026-07-20') !== '', true);
assert.strictEqual(R69.dias.motivoInhabil('2026-07-31') !== '', true);
assert.strictEqual(R69.dias.motivoInhabil('2026-08-03'), '', '3 de agosto es hábil');
// Periodo de vacaciones 2025 (cruce diciembre/enero)
assert.strictEqual(R69.dias.plazoHabil('2025-12-10', 30).vence, '2026-02-09'); // omite 18/12–02/01 y el 2 de febrero

// --- Plazo no iniciado: fecha de revisión anterior a la publicación en el DOF ---
const unDef = { registros: [], porRFC: new Map([['DDD010101DD4', [ep(6, 'Definitivo', { fechaSAT: '2026-01-20', fechaDOF: '2026-01-22' })]]]) };
const plazoAl = f => R69.clasificador.revisar([cf('DDD010101DD4', 'U6', 100, 16)], unDef, { fechaRevision: f }).proveedores[0];
assert.strictEqual(plazoAl('2026-01-01').plazo.estado, 'NO_INICIADO');
assert.strictEqual(plazoAl('2026-01-01').plazo.restantes, 30);
assert.strictEqual(plazoAl('2026-01-01').fechaLimite, '06/03/2026');
assert.ok(plazoAl('2026-01-01').accion.includes('aún no inicia'));
assert.strictEqual(plazoAl('2026-01-22').plazo.estado, 'NO_INICIADO', 'el día de la publicación el cómputo aún no empieza');
assert.strictEqual(plazoAl('2026-01-23').plazo.estado, 'VIGENTE');
assert.strictEqual(plazoAl('2026-03-06').plazo.estado, 'VIGENTE');
assert.strictEqual(plazoAl('2026-03-09').plazo.estado, 'VENCIDO');

// --- Listado parcial: «no encontrado» se refiere solo al archivo cargado ---
const rp = R69.clasificador.revisar([cf('ZZZ010101ZZ9', 'U7', 100, 16)], sintetico, { fechaRevision: '2026-09-30', registrosListadoParcial: 120 });
assert.ok(rp.operaciones[0].motivo.includes('parcial (120 registros)'));

// --- CSV: desvirtuados y sentencias favorables sin importes comprometidos; textos que parecen fórmula ---
require('../js/exportar.js');
const filasCSV = R69.csv.parseCSV(R69.exportar.csvProveedores(r).replace(/^﻿/, ''));
const encCSV = filasCSV[0], filaDe = rfc => filasCSV.find(f => f[0] === rfc);
const colIVA = encCSV.indexOf('IVA comprometido'), colDed = encCSV.indexOf('Monto potencialmente comprometido para deducción de ISR');
for (const rfc of ['PEH160228QX5', 'STN140709BB6']) {
  assert.strictEqual(filaDe(rfc)[colIVA], '', rfc + ': sin IVA comprometido');
  assert.strictEqual(filaDe(rfc)[colDed], '', rfc + ': sin deducción comprometida');
}
const sumaCSV = col => filasCSV.slice(1).reduce((s, f) => s + Math.round((Number(f[col]) || 0) * 100), 0) / 100;
assert.strictEqual(sumaCSV(colIVA), 57088.15, 'el CSV de proveedores concilia con la pantalla y el Excel');
assert.strictEqual(sumaCSV(colDed), 356800.99);
const csvF = R69.exportar.aCSV(['x'], [['=1+1'], ['+5'], ['-A'], ['@SUMA'], [-5], [12.5], ['Normal']]);
assert.strictEqual(csvF, "﻿x\r\n'=1+1\r\n'+5\r\n'-A\r\n'@SUMA\r\n-5\r\n12.50\r\nNormal\r\n");

console.log('Totales por veredicto:');
for (const [k, t] of Object.entries(r.totales)) console.log(' ', k.padEnd(10), String(t.cfdis).padStart(2), 'CFDI · IVA', U.moneda(t.ivaComprometido).padStart(15), '· deducción', U.moneda(t.deduccion).padStart(16));
console.log('\nProveedores listados:');
for (const p of r.proveedores) console.log(' ', p.rfc, p.situacion.padEnd(20), String(p.cfdis), 'CFDI · IVA', U.moneda(p.ivaComprometido).padStart(14), '· deducción', U.moneda(p.deduccion).padStart(15), '·', p.fechaLimite.slice(0, 60));
console.log('\nOK — todas las pruebas pasaron.');
