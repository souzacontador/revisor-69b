/* Lector de ZIP en JavaScript puro (navegador y Node 18+). Sin librerías.
 * Extrae solo los .xml de un ZIP que ya está en memoria. Los ZIP anidados se abren
 * hasta profundidad 2 (el ZIP principal es profundidad 0). Nada sale del equipo. */
(function (root) {
  'use strict';
  const R69 = root.R69 = root.R69 || {};

  // Firmas del formato ZIP (APPNOTE de PKWARE), leídas en little-endian.
  const FIRMA_LOCAL = 0x04034b50;   // "PK\3\4": encabezado local de cada entrada
  const FIRMA_CD = 0x02014b50;      // "PK\1\2": entrada del directorio central
  const FIRMA_EOCD = 0x06054b50;    // "PK\5\6": fin del directorio central (EOCD)
  const TAM_LOCAL = 30;             // longitud fija del encabezado local
  const TAM_CD = 46;                // longitud fija de una entrada del directorio central
  const TAM_EOCD = 22;              // longitud fija del EOCD, sin comentario
  const MAX_COMENTARIO = 65535;     // el comentario del ZIP ocupa como máximo 65535 bytes
  const U32_MAX = 0xFFFFFFFF;       // valor centinela de ZIP64 en tamaños y offsets
  const METODO_STORED = 0;          // sin compresión
  const METODO_DEFLATE = 8;         // deflate
  const PROFUNDIDAD_MAX = 2;        // ZIP principal = 0; ZIP dentro de ZIP dentro de ZIP no se abre

  /* Topes por carga (todos los ZIP de una misma carga, incluidos los anidados, comparten el contador).
   * Protegen la memoria del navegador frente a un ZIP desproporcionado o malicioso. */
  const LIMITES = { archivos: 10000, bytes: 500 * 1024 * 1024 };
  function nuevoContador(limites) { return { archivos: 0, bytes: 0, limites: limites || LIMITES }; }
  /** Error que detiene toda la carga (no solo la entrada actual). */
  function errorLimite(motivo) { const e = new Error(motivo); e.limite = true; return e; }
  /** Suma una entrada al contador; lanza errorLimite si la carga excede los topes. */
  function contar(contador, bytes, esArchivo) {
    if (!contador) return;
    const L = contador.limites;
    if (esArchivo && contador.archivos + 1 > L.archivos) {
      throw errorLimite(`La carga excede el tope de ${L.archivos.toLocaleString('es-MX')} archivos XML. Divídela en partes más pequeñas.`);
    }
    if (contador.bytes + bytes > L.bytes) {
      throw errorLimite(`La carga excede el tope de ${Math.round(L.bytes / 1048576).toLocaleString('es-MX')} MB descomprimidos. Divídela en partes más pequeñas.`);
    }
    if (esArchivo) contador.archivos++;
    contador.bytes += bytes;
  }

  /* CRC-32 (polinomio 0xEDB88320, el de ZIP) para comprobar que cada entrada se leyó íntegra. */
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  /* Nombres: con el bit 11 activo el nombre es UTF-8. Sin él, la especificación ZIP indica
   * CP437 (IBM PC). TextDecoder no trae CP437, así que se usa esta tabla para 0x80–0xFF
   * (por ejemplo 0xA4 = «ñ»). */
  function crearDecodificador(etiqueta) {
    try { return new TextDecoder(etiqueta); } catch (e) { return null; }
  }
  const decUTF8 = typeof TextDecoder !== 'undefined' ? crearDecodificador('utf-8') : null;
  const CP437_ALTO = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

  function decodificarNombre(bytes, esUTF8) {
    if (esUTF8 && decUTF8) return decUTF8.decode(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += bytes[i] < 0x80 ? String.fromCharCode(bytes[i]) : CP437_ALTO[bytes[i] - 0x80];
    return s;
  }

  /** Acepta ArrayBuffer, Uint8Array, Buffer o cualquier vista de búfer, respetando su offset. */
  function aBytes(datos) {
    if (ArrayBuffer.isView(datos)) return new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength);
    if (datos instanceof ArrayBuffer) return new Uint8Array(datos);
    throw new TypeError('Se esperaba un ArrayBuffer o Uint8Array.');
  }

  /* El EOCD está al final del archivo, seguido solo de su comentario (si lo hay).
   * Se busca desde el final hacia atrás, sin pasar de 65535 bytes. Un comentario
   * podría contener la firma por casualidad, así que se prefiere la firma cuyo
   * comentario termina exactamente al final del archivo. */
  function buscarEOCD(v, len) {
    if (len < TAM_EOCD) return -1;
    const minimo = Math.max(0, len - TAM_EOCD - MAX_COMENTARIO);
    let respaldo = -1;
    for (let i = len - TAM_EOCD; i >= minimo; i--) {
      if (v.getUint32(i, true) !== FIRMA_EOCD) continue;
      if (i + TAM_EOCD + v.getUint16(i + 20, true) === len) return i;
      if (respaldo < 0) respaldo = i;
    }
    return respaldo;
  }

  /* Lee el directorio central. Es la fuente de verdad para tamaños, método y offsets:
   * en los ZIP con data descriptor (bit 3) el encabezado local trae ceros. */
  function leerDirectorioCentral(u8, v) {
    const len = u8.length;
    const eocd = buscarEOCD(v, len);
    if (eocd < 0) throw new Error('no es un ZIP válido (no se encontró el final del directorio central)');

    const discoActual = v.getUint16(eocd + 4, true);
    const discoCD = v.getUint16(eocd + 6, true);
    const total = v.getUint16(eocd + 10, true);
    const tamCD = v.getUint32(eocd + 12, true);
    const inicioCD = v.getUint32(eocd + 16, true);

    if (discoActual !== 0 || discoCD !== 0) throw new Error('ZIP multivolumen no soportado');
    if (total === 0xFFFF || tamCD === U32_MAX || inicioCD === U32_MAX) throw new Error('ZIP64 no soportado');
    if (inicioCD + tamCD > eocd) throw new Error('el directorio central está dañado (fuera de límites)');

    const finCD = inicioCD + tamCD;
    const entradas = [];
    let p = inicioCD;
    for (let k = 0; k < total; k++) {
      if (p + TAM_CD > finCD || v.getUint32(p, true) !== FIRMA_CD) {
        throw new Error('el directorio central está dañado (firma no válida)');
      }
      const longNombre = v.getUint16(p + 28, true);
      const longExtra = v.getUint16(p + 30, true);
      const longComentario = v.getUint16(p + 32, true);
      const siguiente = p + TAM_CD + longNombre + longExtra + longComentario;
      if (siguiente > finCD) throw new Error('el directorio central está dañado (entrada fuera de límites)');
      entradas.push({
        banderas: v.getUint16(p + 8, true),
        metodo: v.getUint16(p + 10, true),
        crc: v.getUint32(p + 16, true),
        tamComprimido: v.getUint32(p + 20, true),
        tamDescomprimido: v.getUint32(p + 24, true),
        offsetLocal: v.getUint32(p + 42, true),
        nombre: u8.subarray(p + TAM_CD, p + TAM_CD + longNombre)
      });
      p = siguiente;
    }
    return entradas;
  }

  /** Bytes comprimidos de una entrada. Su inicio sale del encabezado local (30 + nombre + extra locales). */
  function leerDatos(u8, v, e) {
    const L = e.offsetLocal;
    if (L + TAM_LOCAL > u8.length || v.getUint32(L, true) !== FIRMA_LOCAL) {
      throw new Error('encabezado local no válido');
    }
    const inicio = L + TAM_LOCAL + v.getUint16(L + 26, true) + v.getUint16(L + 28, true);
    if (inicio + e.tamComprimido > u8.length) throw new Error('datos fuera de límites');
    return u8.subarray(inicio, inicio + e.tamComprimido);
  }

  /** Descomprime deflate crudo (sin cabecera zlib) con DecompressionStream. Corta si excede el tamaño declarado. */
  async function descomprimir(comprimido, tamEsperado) {
    if (typeof DecompressionStream === 'undefined') throw new Error('este entorno no soporta DecompressionStream');
    const lector = new Blob([comprimido]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
      .getReader();
    const trozos = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        total += value.byteLength;
        if (total > tamEsperado) throw new Error('el contenido excede el tamaño declarado');
        trozos.push(value);
      }
    } catch (err) {
      lector.cancel().catch(() => {});
      throw new Error('error de descompresión: ' + err.message);
    }
    if (total !== tamEsperado) throw new Error('error de descompresión: el tamaño no coincide con el declarado');
    const salida = new Uint8Array(total);
    let pos = 0;
    for (const t of trozos) { salida.set(t, pos); pos += t.byteLength; }
    return salida;
  }

  async function leerContenido(u8, v, e) {
    const comprimido = leerDatos(u8, v, e);
    let contenido;
    if (e.metodo === METODO_STORED) {
      if (e.tamComprimido !== e.tamDescomprimido) throw new Error('tamaños inconsistentes en entrada sin compresión');
      contenido = comprimido.slice();   // copia: no retiene el ZIP completo
    } else {
      contenido = await descomprimir(comprimido, e.tamDescomprimido);
    }
    if (crc32(contenido) !== e.crc) throw new Error('el CRC-32 no coincide: el archivo está dañado');
    return contenido;
  }

  /** "\" pasa a "/" (APPNOTE exige "/"; algunos programas de Windows lo escriben al revés). */
  function normalizarRuta(nombre) {
    return nombre.replace(/\\/g, '/').replace(/^\/+/, '');
  }

  /** Basura del sistema: carpetas __MACOSX/ y archivos "._*" de AppleDouble. */
  function esBasuraSistema(partes) {
    return partes.indexOf('__MACOSX') >= 0 || partes[partes.length - 1].indexOf('._') === 0;
  }

  /** Procesa un ZIP ya en memoria. "prefijo" es la ruta del ZIP contenedor; "profundidad" es su nivel de anidamiento. */
  async function extraer(u8, prefijo, profundidad, contador) {
    const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const entradas = leerDirectorioCentral(u8, v);
    const archivos = [];
    const omitidos = [];

    for (const e of entradas) {
      const nombre = normalizarRuta(decodificarNombre(e.nombre, (e.banderas & 0x0800) !== 0));
      if (!nombre || nombre.charAt(nombre.length - 1) === '/') continue;   // carpeta
      const partes = nombre.split('/');
      if (esBasuraSistema(partes)) continue;

      const ruta = prefijo + nombre;
      const base = partes[partes.length - 1].toLowerCase();
      const esXML = base.endsWith('.xml');
      const esZIP = base.endsWith('.zip');
      if (!esXML && !esZIP) { omitidos.push({ nombre: ruta, motivo: 'no es XML ni ZIP' }); continue; }
      if (e.banderas & 0x0001) { omitidos.push({ nombre: ruta, motivo: 'entrada cifrada (no soportado)' }); continue; }
      if (e.tamComprimido === U32_MAX || e.tamDescomprimido === U32_MAX || e.offsetLocal === U32_MAX) {
        omitidos.push({ nombre: ruta, motivo: 'ZIP64 no soportado' });
        continue;
      }
      if (e.metodo !== METODO_STORED && e.metodo !== METODO_DEFLATE) {
        omitidos.push({ nombre: ruta, motivo: 'método de compresión no soportado (' + e.metodo + ')' });
        continue;
      }
      if (esZIP && profundidad + 1 > PROFUNDIDAD_MAX) {
        omitidos.push({ nombre: ruta, motivo: 'profundidad de anidamiento excedida' });
        continue;
      }

      // El tamaño declarado se cuenta antes de descomprimir; la descompresión no permite excederlo
      contar(contador, e.tamDescomprimido, esXML);
      try {
        const contenido = await leerContenido(u8, v, e);
        if (esXML) {
          archivos.push({ nombre: ruta, bytes: contenido });
        } else {
          const interno = await extraer(contenido, ruta + '/', profundidad + 1, contador);
          for (const a of interno.archivos) archivos.push(a);
          for (const o of interno.omitidos) omitidos.push(o);
        }
      } catch (err) {
        if (err.limite) throw err;
        const prefijoMotivo = esZIP ? 'ZIP anidado no válido: ' : 'error al leer el contenido: ';
        omitidos.push({ nombre: ruta, motivo: prefijoMotivo + err.message });
      }
    }
    return { archivos, omitidos };
  }

  /** Promesa con { archivos: [{ nombre, bytes }], omitidos: [{ nombre, motivo }] }.
   *  Rechaza si los datos no son un ZIP legible en su directorio central, o (con err.limite)
   *  si la carga excede los topes. "contador" (de nuevoContador) se comparte entre los ZIP de una carga. */
  async function extraerXML(datos, nombreZip, contador) {
    const etiqueta = nombreZip ? 'El archivo «' + nombreZip + '»' : 'El archivo';
    const u8 = aBytes(datos);
    try {
      return await extraer(u8, '', 0, contador || nuevoContador());
    } catch (err) {
      if (err.limite) throw err;
      throw new Error(etiqueta + ': ' + err.message + '.');
    }
  }

  R69.zip = { extraerXML, LIMITES, nuevoContador, contar };
  if (typeof module !== 'undefined' && module.exports) module.exports = R69;
})(typeof window !== 'undefined' ? window : globalThis);
