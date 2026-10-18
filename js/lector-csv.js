/* Lector del listado del artículo 69-B (formato del SAT).
 * - Decodifica Windows-1252 (o UTF-8 si trae BOM) sin romper acentos, comillas tipográficas ni guiones.
 * - Detecta el renglón de encabezado (el SAT trae 2 o 3 renglones de título antes).
 * - Respeta comillas y saltos de línea dentro de campos.
 * - Conserva TODOS los renglones de un mismo RFC (episodios). */
(function (root) {
  'use strict';
  const R69 = root.R69 = root.R69 || {};
  const U = R69.util || (typeof require !== 'undefined' ? require('./util.js').util : null);

  const SITUACIONES = ['Presunto', 'Desvirtuado', 'Definitivo', 'Sentencia Favorable'];

  /** Bytes del archivo → texto. */
  function decodificar(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return new TextDecoder('utf-8').decode(b.subarray(3));
    return new TextDecoder('windows-1252').decode(b);
  }

  /** CSV (RFC 4180) → arreglo de renglones; cada renglón es un arreglo de celdas. */
  function parseCSV(texto) {
    const filas = [];
    let fila = [], celda = '', i = 0, enComillas = false;
    const n = texto.length;
    while (i < n) {
      const c = texto[i];
      if (enComillas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { celda += '"'; i += 2; continue; }
          enComillas = false; i++; continue;
        }
        celda += c; i++; continue;
      }
      if (c === '"') { enComillas = true; i++; continue; }
      if (c === ',') { fila.push(celda); celda = ''; i++; continue; }
      if (c === '\r' || c === '\n') {
        fila.push(celda); filas.push(fila); fila = []; celda = '';
        if (c === '\r' && texto[i + 1] === '\n') i++;
        i++; continue;
      }
      celda += c; i++;
    }
    if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
    return filas;
  }

  // Clave normalizada del encabezado → [grupo, campo]
  const COLUMNAS = {
    'rfc': ['rfc'],
    'nombre del contribuyente': ['nombre'],
    'situacion del contribuyente': ['situacion'],
    'numero y fecha de oficio global de presuncion sat': ['presunto', 'oficioSAT'],
    'publicacion pagina sat presuntos': ['presunto', 'fechaSAT'],
    'numero y fecha de oficio global de presuncion dof': ['presunto', 'oficioDOF'],
    'publicacion dof presuntos': ['presunto', 'fechaDOF'],
    'numero y fecha de oficio global de contribuyentes que desvirtuaron sat': ['desvirtuado', 'oficioSAT'],
    'publicacion pagina sat desvirtuados': ['desvirtuado', 'fechaSAT'],
    'numero y fecha de oficio global de contribuyentes que desvirtuaron dof': ['desvirtuado', 'oficioDOF'],
    'publicacion dof desvirtuados': ['desvirtuado', 'fechaDOF'],
    'numero y fecha de oficio global de definitivos sat': ['definitivo', 'oficioSAT'],
    'publicacion pagina sat definitivos': ['definitivo', 'fechaSAT'],
    'numero y fecha de oficio global de definitivos dof': ['definitivo', 'oficioDOF'],
    'publicacion dof definitivos': ['definitivo', 'fechaDOF'],
    'numero y fecha de oficio global de sentencia favorable sat': ['sentencia', 'oficioSAT'],
    'publicacion pagina sat sentencia favorable': ['sentencia', 'fechaSAT'],
    'numero y fecha de oficio global de sentencia favorable dof': ['sentencia', 'oficioDOF'],
    'publicacion dof sentencia favorable': ['sentencia', 'fechaDOF']
  };

  function situacionCanonica(t) {
    const k = U.claveTexto(t);
    return SITUACIONES.find(s => U.claveTexto(s) === k) || '';
  }

  /** Busca "actualizada al …" en los renglones de título. */
  function leyendaActualizacion(lineasTitulo) {
    for (const l of lineasTitulo) {
      const m = /actualizada al\s+([^;,"]+)/i.exec(l);
      if (m) return m[1].trim();
    }
    return '';
  }

  /** Texto del CSV → listado estructurado. Lanza Error si no reconoce el formato. */
  function leerListado(texto) {
    const filas = parseCSV(texto);
    let iEnc = -1;
    for (let i = 0; i < Math.min(filas.length, 15); i++) {
      const claves = filas[i].map(U.claveTexto);
      if (claves.includes('rfc') && claves.includes('situacion del contribuyente')) { iEnc = i; break; }
    }
    if (iEnc < 0) throw new Error('No se encontró el renglón de encabezado (columnas «RFC» y «Situación del contribuyente»). ¿Es el listado completo del 69-B?');

    const encabezado = filas[iEnc];
    const mapa = encabezado.map(h => COLUMNAS[U.claveTexto(h)] || null);
    const faltantes = Object.keys(COLUMNAS).filter(k => !encabezado.some(h => U.claveTexto(h) === k));
    const titulo = filas.slice(0, iEnc).map(f => f.filter(Boolean).join(' ').trim()).filter(Boolean);

    const registros = [];
    const advertencias = [];
    const porRFC = new Map();
    const conteos = { Presunto: 0, Desvirtuado: 0, Definitivo: 0, 'Sentencia Favorable': 0, Otra: 0 };

    for (let i = iEnc + 1; i < filas.length; i++) {
      const f = filas[i];
      if (!f.some(c => String(c).trim() !== '')) continue;
      const reg = { renglon: i + 1, presunto: {}, desvirtuado: {}, definitivo: {}, sentencia: {} };
      f.forEach((valor, j) => {
        const destino = mapa[j];
        if (!destino) return;
        if (destino.length === 1) reg[destino[0]] = valor;
        else reg[destino[0]][destino[1]] = destino[1].startsWith('fecha') ? U.fechaAISO(valor) : String(valor).trim();
      });
      reg.rfcCrudo = reg.rfc || '';
      reg.rfc = U.normalizarRFC(reg.rfcCrudo);
      reg.nombre = String(reg.nombre || '').trim();
      reg.situacionCruda = String(reg.situacion || '').trim();
      reg.situacion = situacionCanonica(reg.situacionCruda);
      if (!reg.rfc) { advertencias.push(`Renglón ${reg.renglon}: sin RFC; se omitió.`); continue; }
      if (reg.rfc !== reg.rfcCrudo) advertencias.push(`Renglón ${reg.renglon}: RFC «${reg.rfcCrudo}» normalizado a ${reg.rfc}.`);
      if (!U.esRFCValido(reg.rfc)) advertencias.push(`Renglón ${reg.renglon}: RFC «${reg.rfc}» no tiene estructura válida.`);
      if (!reg.situacion) advertencias.push(`Renglón ${reg.renglon}: situación desconocida «${reg.situacionCruda}».`);
      conteos[reg.situacion || 'Otra']++;
      registros.push(reg);
      if (!porRFC.has(reg.rfc)) porRFC.set(reg.rfc, []);
      porRFC.get(reg.rfc).push(reg);
    }

    let multiples = 0;
    porRFC.forEach(lista => { if (lista.length > 1) multiples++; });

    return {
      titulo,
      actualizadoAl: leyendaActualizacion(titulo),
      renglonEncabezado: iEnc + 1,
      columnasFaltantes: faltantes,
      registros,
      porRFC,
      conteos,
      rfcConVariosEpisodios: multiples,
      advertencias
    };
  }

  /** Validación previa a sustituir un listado (la usan la app y la GitHub Action). */
  function validarListado(listado, opciones) {
    const minimo = (opciones && opciones.minimoRegistros) || 1;
    const errores = [];
    if (listado.columnasFaltantes.length) errores.push('Faltan columnas: ' + listado.columnasFaltantes.join(', '));
    if (listado.registros.length < minimo) errores.push(`Solo ${listado.registros.length} registros (mínimo esperado ${minimo}).`);
    const validos = listado.registros.filter(r => U.esRFCValido(r.rfc)).length;
    if (listado.registros.length && validos / listado.registros.length < 0.98) errores.push('Menos del 98 % de los RFC tiene estructura válida.');
    if (listado.conteos.Otra > listado.registros.length * 0.02) errores.push('Demasiados registros con situación desconocida.');
    return { ok: errores.length === 0, errores };
  }

  R69.csv = { SITUACIONES, decodificar, parseCSV, leerListado, validarListado };
  if (typeof module !== 'undefined' && module.exports) module.exports = R69;
})(typeof window !== 'undefined' ? window : globalThis);
