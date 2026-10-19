/* Revisor de Proveedores 69-B — interfaz.
 * Una sola pantalla para los dos modos. Lo único que cambia entre DEMO y REAL es el listado del 69-B:
 *   DEMO → listado del caso de práctica (precargado), con los 40 CFDI del caso precargados y editables.
 *   REAL → listado vigente del SAT (copia diaria guardada en el sitio o CSV cargado a mano).
 * Cada modo conserva su propio estado (CFDI, ajustes, fecha y resultados). */
(function () {
  'use strict';
  const U = R69.util, C = R69.clasificador, E = R69.exportar;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const h = U.escaparHTML;
  const ico = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;

  // Evidencia de materialidad sugerida (fuente: cuaderno «Curso Fiscalización 2026 DSV», manuales M3/M5)
  const EVIDENCIA = [
    ['Capacidad del proveedor', 'activos, personal (registros IMSS, CFDI de nómina), infraestructura (domicilio operativo, servicios) y capacidad material o subcontratistas.'],
    ['Lógica de negocio', 'necesidad documentada antes de contratar, contrato u orden de compra con alcance, entregables, plazos y precio; fecha cierta en operaciones relevantes; precio razonable.'],
    ['Ejecución y recepción', 'entregables, bitácoras, minutas, correos con sus metadatos originales, remisiones, registros de almacén, cartas porte, fotografías con fecha.'],
    ['Terceros independientes', 'guías de transportistas, manifiestos u otra evidencia que no provenga del proveedor.'],
    ['Trazabilidad financiera', 'estados de cuenta que acrediten el pago desde la cuenta de la empresa a una cuenta del emisor del CFDI.']
  ];

  const nuevoEstado = (fecha) => ({
    listado: null, fuente: null, avisoListado: '', fechaDatos: '',
    cfdis: [], porUUID: new Map(), registro: { omitidos: [], errores: [] }, ultimaCarga: null,
    resultado: null, ajustes: {}, isr: { modo: 'no', tasa: 30, regimen: '' },
    fechaRevision: fecha, filtro: 'TODOS', busqueda: '',
    descargado: false,   // ¿se descargó algún entregable del resultado actual?
    mensajeNuevo: false  // mostrar «Listo para iniciar un nuevo análisis»
  });
  const FECHA_DEMO = '2026-09-30';
  const estado = { demo: nuevoEstado(FECHA_DEMO), real: nuevoEstado(U.hoyISO()) };
  let modo = 'demo';
  const st = () => estado[modo];

  const guardar = (k, v) => { try { localStorage.setItem('r69.' + k, v); } catch (e) { /* almacenamiento no disponible */ } };
  const leer = (k) => { try { return localStorage.getItem('r69.' + k); } catch (e) { return null; } };

  // ====================== Controles generales ======================
  function iniciarTamano() {
    const aplicar = (t) => {
      document.documentElement.setAttribute('data-tamano', t);
      $$('.tamano button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tamano === t)));
      guardar('tamano', t);
    };
    $$('.tamano button').forEach(b => b.addEventListener('click', () => aplicar(b.dataset.tamano)));
    const t = leer('tamano'); if (t === 'A' || t === 'A+' || t === 'A++') aplicar(t);
  }

  function iniciarModos() {
    const tabs = [$('#tab-demo'), $('#tab-real')];
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => cambiarModo(t.id.slice(4)));
      t.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); cambiarModo(tabs[(i + 1) % 2].id.slice(4), true); }
      });
    });
  }

  /** Cambia de modo y vuelve a pintar toda la pantalla con el estado de ese modo. */
  function cambiarModo(nuevo, enfocar) {
    modo = nuevo === 'real' ? 'real' : 'demo';
    $$('.modo [role="tab"]').forEach(t => {
      const sel = t.id === 'tab-' + modo;
      t.setAttribute('aria-selected', String(sel)); t.tabIndex = sel ? 0 : -1;
      if (sel && enfocar) t.focus();
    });
    $('#principal').setAttribute('aria-labelledby', 'tab-' + modo);
    guardar('modo', modo);
    if (location.hash !== '#' + modo) history.replaceState(null, '', '#' + modo);

    // 1. Listado (lo único distinto entre modos)
    $('#listado-desc').innerHTML = modo === 'demo'
      ? '<strong>Modo DEMO:</strong> se usa el listado del 69-B del caso de práctica (datos ficticios). Todo lo demás funciona igual que en el modo REAL.'
      : 'Una tarea automática descarga cada día el listado completo del sitio de datos abiertos del SAT, lo valida y guarda la última versión válida en este sitio. Si la descarga falla, se conserva la versión anterior.';
    $('#listado-acciones-real').hidden = modo !== 'real';
    pintarEstadoListado();
    // 2. CFDI
    $('#restaurar-caso').hidden = modo !== 'demo';
    pintarResumenCFDI();
    // 3. Parámetros
    $('#fecha-revision').value = st().fechaRevision;
    renderParametrosISR();
    // 4. Resultados
    if (st().resultado) { recalcular(true); $('#resultados').hidden = false; }
    else $('#resultados').hidden = true;
    actualizarBoton();
  }

  // ====================== Componentes de resultados ======================
  function etiquetaSituacion(sit) {
    const nivel = sit === 'Definitivo' ? 'alto' : sit === 'Presunto' ? 'medio' : (sit === 'Desvirtuado' || sit === 'Sentencia Favorable') ? 'bajo' : sit === 'No listado' ? 'info' : 'medio';
    return `<span class="etiqueta-sit nivel-${nivel}${nivel === 'info' ? ' sin-punto' : ''}">${h(sit)}</span>`;
  }
  function etiquetaVeredicto(v) { return `<span class="etiqueta-sit nivel-${v.nivel}">${h(v.corto || v.texto)}</span>`; }

  function renderKPIs() {
    const r = st().resultado, t = r.totales;
    const tarjeta = (clave, titulo, nivel, sinRiesgo) => {
      const x = t[clave];
      return `<div class="kpi nivel-${nivel}">
        <p class="kpi__titulo">${h(titulo)}</p>
        <p class="kpi__cifra">${x.cfdis} <small>CFDI</small></p>
        <dl>
          <dt>${sinRiesgo ? 'IVA' : 'IVA comprometido'}</dt><dd>${U.moneda(sinRiesgo ? x.iva : x.ivaComprometido)}</dd>
          <dt>${sinRiesgo ? 'Subtotal' : 'Deducción potencial'}</dt><dd>${U.moneda(sinRiesgo ? x.subtotal : x.deduccion)}</dd>
        </dl></div>`;
    };
    const tarjetas = [tarjeta('SIN_EFECTO', 'Sin efecto fiscal', 'alto'), tarjeta('EN_RIESGO', 'En riesgo (presuntos)', 'medio')];
    if (t.REVISION.cfdis) tarjetas.push(tarjeta('REVISION', 'Requiere revisión documental', 'medio'));
    tarjetas.push(tarjeta('SIN_RIESGO', 'Sin riesgo', 'bajo', true));
    $('#kpis').innerHTML = `
      <div class="franja-datos" role="status">
        <span>Modo: <b>${modo === 'demo' ? 'DEMO' : 'REAL'}</b></span>
        <span><b>${r.operaciones.length}</b> CFDI analizados</span>
        <span><b>${r.emisores}</b> proveedores</span>
        <span><b>${r.listados}</b> en el listado 69-B</span>
        <span>Fecha de revisión: <b>${U.fechaMX(r.fechaRevision)}</b></span>
        <span>Listado consultado: <b>${h(r.fechaDatos || 'sin fecha')}</b></span>
      </div>
      <div class="rejilla rejilla--${tarjetas.length === 4 ? '4' : '3'}" style="margin-top:16px">${tarjetas.join('')}</div>`;
  }

  function filasOperaciones() {
    const s = st(), q = U.claveTexto(s.busqueda);
    return s.resultado.operaciones.filter(o =>
      (s.filtro === 'TODOS' || o.veredicto.clave === s.filtro) &&
      (!q || U.claveTexto(o.proveedor + ' ' + o.rfc + ' ' + o.uuid).includes(q)));
  }

  function renderOperaciones() {
    const s = st(), r = s.resultado, cont = $('#operaciones');
    const cuenta = k => r.operaciones.filter(o => o.veredicto.clave === k).length;
    const chips = [['TODOS', 'Todas', r.operaciones.length], ['SIN_EFECTO', 'Sin efecto fiscal', cuenta('SIN_EFECTO')], ['EN_RIESGO', 'En riesgo', cuenta('EN_RIESGO')], ['REVISION', 'Revisión documental', cuenta('REVISION')], ['SIN_RIESGO', 'Sin riesgo', cuenta('SIN_RIESGO')]]
      .filter(c => c[0] === 'TODOS' || c[2] > 0);
    if (!chips.some(c => c[0] === s.filtro)) s.filtro = 'TODOS';
    cont.innerHTML = `
      <h3>Tabla por operación</h3>
      <p class="pequeno secundario">UUID, proveedor, RFC, fecha, subtotal, IVA, situación del proveedor y veredicto.</p>
      <div class="filtros no-imprimir" role="group" aria-label="Filtrar operaciones">
        ${chips.map(c => `<button type="button" class="chip" data-filtro="${c[0]}" aria-pressed="${s.filtro === c[0]}">${h(c[1])} (${c[2]})</button>`).join('')}
        <div class="buscar"><label class="oculto-visual" for="buscar">Buscar por proveedor, RFC o UUID</label>
          <input type="search" id="buscar" placeholder="Buscar proveedor, RFC o UUID" value="${h(s.busqueda)}"></div>
      </div>
      <div class="tabla-envoltura tabla-tarjetas"><table>
        <caption class="oculto-visual">Operaciones clasificadas</caption>
        <thead><tr><th scope="col">UUID</th><th scope="col">Proveedor</th><th scope="col">RFC</th><th scope="col">Fecha</th><th scope="col" class="num">Subtotal</th><th scope="col" class="num">IVA</th><th scope="col">Situación del proveedor y veredicto</th><th scope="col">Importes comprometidos</th></tr></thead>
        <tbody></tbody><tfoot></tfoot></table></div>`;
    pintarCuerpoOperaciones();
  }

  function pintarCuerpoOperaciones() {
    const s = st(), cont = $('#operaciones');
    const filas = filasOperaciones();
    const tb = $('tbody', cont), tf = $('tfoot', cont);
    if (!filas.length) { tb.innerHTML = `<tr><td colspan="8" class="ancho-completo">No hay operaciones con este filtro.</td></tr>`; tf.innerHTML = ''; return; }
    tb.innerHTML = filas.map(o => {
      const aj = s.ajustes[o.uuid] || {};
      const editable = o.veredicto.clave !== 'SIN_RIESGO';
      const importes = editable ? `<div class="ajuste">
          <label for="aj-d-${o.uuid}">Deducido (ISR)</label>
          <input type="number" inputmode="decimal" step="0.01" min="0" id="aj-d-${o.uuid}" data-uuid="${o.uuid}" data-campo="deduccion" value="${aj.deduccion != null ? aj.deduccion : o.deduccionPotencial.toFixed(2)}">
          <label for="aj-i-${o.uuid}">IVA acreditado</label>
          <input type="number" inputmode="decimal" step="0.01" min="0" id="aj-i-${o.uuid}" data-uuid="${o.uuid}" data-campo="iva" value="${aj.iva != null ? aj.iva : o.iva.toFixed(2)}">
        </div>` : '<span class="secundario">—</span>';
      return `<tr class="fila-${o.veredicto.nivel}">
        <td data-label="UUID" class="mono">${h(o.uuid)}</td>
        <td data-label="Proveedor">${h(o.proveedor)}${o.nota ? `<div class="nota-nombre">${h(o.nota)}</div>` : ''}</td>
        <td data-label="RFC" class="mono rfc">${h(o.rfc)}</td>
        <td data-label="Fecha">${U.fechaMX(o.fecha)}</td>
        <td data-label="Subtotal" class="num">${U.moneda(o.subtotal)}</td>
        <td data-label="IVA" class="num">${U.moneda(o.iva)}</td>
        <td data-label="Situación y veredicto"><div class="sit-ver">${etiquetaSituacion(o.situacion)}${etiquetaVeredicto(o.veredicto)}</div><details class="motivo"><summary>Motivo</summary>${h(o.motivo)}</details></td>
        <td data-label="Importes comprometidos">${importes}</td></tr>`;
    }).join('');
    const sum = k => U.deCentavos(filas.reduce((x, o) => x + U.centavos(o[k]), 0));
    tf.innerHTML = `<tr><td colspan="4">Total de las ${filas.length} operaciones mostradas</td><td class="num">${U.moneda(sum('subtotal'))}</td><td class="num">${U.moneda(sum('iva'))}</td><td colspan="2"></td></tr>`;
  }

  function lineaTiempo(fechas) {
    const clase = { 'Presunto': 'presunto', 'Desvirtuado': 'desvirtuado', 'Definitivo': 'definitivo', 'Sentencia favorable': 'sentencia' };
    return `<ol class="linea-tiempo">${fechas.map(f => `<li class="etapa-${clase[f.etapa]}"><div><strong>${h(f.etapa)}</strong> · SAT ${f.fechaSAT ? U.fechaMX(f.fechaSAT) : 'sin fecha'} · DOF ${f.fechaDOF ? U.fechaMX(f.fechaDOF) : 'sin fecha'}
      ${f.oficioSAT || f.oficioDOF ? `<span class="oficio">Oficio SAT: ${h(f.oficioSAT || '—')} · Oficio DOF: ${h(f.oficioDOF || '—')}</span>` : ''}</div></li>`).join('')}</ol>`;
  }

  function renderImpacto() {
    const r = st().resultado, cont = $('#impacto');
    if (!r.proveedores.length) { cont.innerHTML = `<div class="aviso aviso--bajo">${ico('i-ok')}<p>Ninguno de los ${r.emisores} proveedores aparece en el listado consultado (${h(r.fechaDatos)}).</p></div>`; return; }
    const conISR = r.tasaISR != null;
    cont.innerHTML = `
      <div class="rejilla rejilla--2">${r.proveedores.map(p => `
        <article class="tarjeta proveedor nivel-${p.veredicto.nivel}">
          <div class="proveedor__cabeza">
            <div><h3>${h(p.nombre)}</h3><p class="proveedor__rfc">${h(p.rfc)}</p></div>
            <div>${etiquetaSituacion(p.situacion)}</div>
          </div>
          ${U.claveTexto(p.nombre) !== U.claveTexto(p.nombreListado) ? `<p class="pequeno secundario">En el listado como: ${h(p.nombreListado)}</p>` : ''}
          <p style="margin:8px 0 0">${etiquetaVeredicto(p.veredicto)}</p>
          <div class="cifras">
            <div class="cifra"><span>CFDI del periodo</span><b>${p.cfdis}</b><span>${U.fechaMX(p.primeraFactura)} a ${U.fechaMX(p.ultimaFactura)}</span></div>
            <div class="cifra"><span>${p.veredicto.clave === 'SIN_RIESGO' ? 'IVA de los CFDI (conserva efectos)' : 'IVA acreditado comprometido'}</span><b>${U.moneda(p.ivaComprometido)}</b></div>
            <div class="cifra"><span>${p.veredicto.clave === 'SIN_RIESGO' ? 'Deducción (conserva efectos)' : 'Monto potencialmente comprometido para deducción de ISR'}</span><b>${U.moneda(p.deduccion)}</b></div>
            ${conISR && p.isrEstimado != null ? `<div class="cifra"><span>Estimación de ISR (${(r.tasaISR * 100).toFixed(2).replace(/\.00$/, '')} %${r.regimenISR ? ' · ' + h(r.regimenISR) : ''})</span><b>${U.moneda(p.isrEstimado)}</b></div>` : ''}
          </div>
          <h4>Publicaciones en el listado${p.episodios.length > 1 ? ` (${p.episodios.length} episodios)` : ''}</h4>
          ${p.episodios.map((e, i) => `${p.episodios.length > 1 ? `<p class="pequeno" style="margin:8px 0 0"><strong>Episodio ${i + 1}</strong> (renglón ${e.renglon}): ${h(e.situacion)}</p>` : ''}${lineaTiempo(e.fechas)}`).join('')}
        </article>`).join('')}
      </div>`;
  }

  function diasAdicionalesTexto() {
    return R69.dias.DIAS_ADICIONALES.map(d => d.desde === d.hasta ? U.fechaMX(d.desde) : `${U.fechaMX(d.desde)} a ${U.fechaMX(d.hasta)}`).join('; ');
  }

  function detallePlazo(p, fechaRevision) {
    const pl = p.plazo;
    if (!pl) return '';
    if (pl.estado === 'PENDIENTE_DOF') return `<p class="pequeno">Fecha SAT del definitivo: ${pl.fechaSAT ? U.fechaMX(pl.fechaSAT) : 'sin fecha'}. Falta la fecha de publicación en el DOF; no se calcula un vencimiento definitivo.</p>`;
    const omit = pl.inhabilesOmitidos.length ? pl.inhabilesOmitidos.map(x => `${U.fechaMX(x.fecha)} (${h(x.motivo)})`).join('; ') : 'ninguno';
    return `<ul class="vinetas pequeno" style="margin-top:8px">
      <li>Publicación del definitivo: SAT ${pl.fechaSAT ? U.fechaMX(pl.fechaSAT) : 'sin fecha'} · DOF ${U.fechaMX(pl.fechaDOF)}. <strong>Fecha usada para el plazo: DOF.</strong></li>
      <li>Se cuentan 30 días hábiles a partir del ${U.fechaLarga(pl.inicioCuenta)}, sin sábados, domingos ni inhábiles del art. 12 CFF.</li>
      <li>Inhábiles entre semana omitidos: ${omit}.</li>
      <li>${pl.estado === 'VIGENTE' ? `Al ${U.fechaMX(fechaRevision)} quedan <strong>${pl.restantes} días hábiles</strong>.` : `Al ${U.fechaMX(fechaRevision)} el plazo ya <strong>venció</strong>.`}</li>
      <li class="secundario">Además del art. 12, solo se consideran los días inhábiles capturados en la app (vacaciones generales y días que declara la RMF: ${h(diasAdicionalesTexto())}). Si el plazo cruza un periodo de vacaciones del SAT aún no capturado, la fecha real sería posterior: la fecha mostrada es conservadora.</li>
    </ul>`;
  }

  function renderAcciones() {
    const r = st().resultado, cont = $('#acciones');
    if (!r.proveedores.length) { cont.innerHTML = `<p>No hay proveedores listados: no se requieren acciones por el art. 69-B.</p>`; return; }
    cont.innerHTML = `<div class="rejilla rejilla--2">${r.proveedores.map(p => {
      const conFecha = p.veredicto.clave === 'SIN_EFECTO' && p.plazo && p.plazo.vence && p.episodios.length === 1;
      const evidencia = (p.situacion === 'Presunto' || p.situacion === 'Definitivo') ? `<details class="detalle"><summary>Evidencia de materialidad sugerida</summary>
          <ul class="vinetas pequeno">${EVIDENCIA.map(e => `<li><strong>${h(e[0])}:</strong> ${h(e[1])}</li>`).join('')}</ul>
          <p class="pequeno secundario">Fuente: cuaderno «Curso Fiscalización 2026 DSV» (manuales de materialidad). No se deben fabricar ni antedatar documentos.</p></details>` : '';
      return `<article class="tarjeta proveedor nivel-${p.veredicto.nivel}">
        <div class="proveedor__cabeza"><div><h3>${h(p.nombre)}</h3><p class="proveedor__rfc">${h(p.rfc)}</p></div>${etiquetaSituacion(p.situacion)}</div>
        <p style="margin-top:12px"><strong>Acción recomendada:</strong> ${h(p.accion)}</p>
        <div class="limite${conFecha ? '' : ' sin-plazo'}">
          <p class="limite__titulo">Fecha límite</p>
          <p class="limite__fecha">${h(conFecha ? U.fechaLarga(p.plazo.vence) + (p.plazo.estado === 'VENCIDO' ? ' (vencido)' : '') : p.fechaLimite)}</p>
        </div>
        ${p.episodios.length === 1 ? detallePlazo(p, r.fechaRevision) : ''}
        <details class="detalle"><summary>Motivo</summary><p class="pequeno">${h(p.motivo)}</p></details>
        ${evidencia}
      </article>`;
    }).join('')}</div>`;
  }

  /** Entregable: resumen por proveedor listado en una sola tabla con los campos pedidos. */
  function renderResumenTabla() {
    const r = st().resultado, cont = $('#resumen-tabla');
    if (!r.proveedores.length) { cont.innerHTML = `<p>Ninguno de los ${r.emisores} proveedores aparece en el listado consultado (${h(r.fechaDatos)}).</p>`; return; }
    const pubs = p => p.episodios.map((e, i) => (p.episodios.length > 1 ? `<strong>Episodio ${i + 1}</strong><br>` : '') + e.fechas.map(f =>
      `${h(f.etapa)}: SAT ${f.fechaSAT ? U.fechaMX(f.fechaSAT) : 's/f'} · DOF ${f.fechaDOF ? U.fechaMX(f.fechaDOF) : 's/f'}`).join('<br>')).join('<br>');
    const limite = p => {
      const pl = p.plazo;
      if (pl && pl.vence && p.episodios.length === 1) return `<span class="etiqueta-sit sin-punto ${pl.estado === 'VENCIDO' ? 'nivel-alto' : 'nivel-medio'}">${U.fechaMX(pl.vence)}${pl.estado === 'VENCIDO' ? ' · vencido' : ''}</span>`;
      return h(p.fechaLimite);
    };
    const comp = r.proveedores.filter(p => p.veredicto.clave !== 'SIN_RIESGO');
    const suma = k => U.deCentavos(comp.reduce((x, p) => x + U.centavos(p[k]), 0));
    cont.innerHTML = `<div class="tabla-envoltura tabla-tarjetas"><table class="tabla-resumen">
      <caption class="oculto-visual">Resumen por proveedor listado</caption>
      <colgroup><col style="width:17%"><col style="width:12%"><col style="width:17%"><col style="width:10%"><col style="width:11%"><col style="width:22%"><col style="width:11%"></colgroup>
      <thead><tr><th scope="col">Proveedor</th><th scope="col">Situación</th><th scope="col">Fechas de publicación relevantes</th><th scope="col" class="num">IVA comprometido</th><th scope="col" class="num">Deducción comprometida</th><th scope="col">Acción recomendada</th><th scope="col">Fecha límite</th></tr></thead>
      <tbody>${r.proveedores.map(p => {
        const sinRiesgo = p.veredicto.clave === 'SIN_RIESGO';
        return `<tr class="fila-${p.veredicto.nivel}">
        <td data-label="Proveedor"><div><strong>${h(p.nombre)}</strong><br><span class="mono">${h(p.rfc)}</span></div></td>
        <td data-label="Situación"><div class="sit-ver">${etiquetaSituacion(p.situacion)}${etiquetaVeredicto(p.veredicto)}</div></td>
        <td data-label="Publicaciones"><div class="pequeno">${pubs(p)}</div></td>
        <td data-label="IVA comprometido" class="num">${sinRiesgo ? '—' : U.moneda(p.ivaComprometido)}</td>
        <td data-label="Deducción comprometida" class="num">${sinRiesgo ? '—' : U.moneda(p.deduccion)}</td>
        <td data-label="Acción recomendada"><div class="pequeno">${h(p.accion)}</div></td>
        <td data-label="Fecha límite"><div>${limite(p)}</div></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="3">Total comprometido (${comp.length} proveedor${comp.length === 1 ? '' : 'es'})</td><td class="num">${U.moneda(suma('ivaComprometido'))}</td><td class="num">${U.moneda(suma('deduccion'))}</td><td colspan="2"></td></tr></tfoot>
    </table></div>
    <p class="pequeno secundario" style="margin-top:8px">La deducción comprometida es el monto potencial (SubTotal − Descuento) o el importe que ajustaste en la tabla por operación. Desvirtuados y sentencias favorables conservan sus efectos.</p>`;
  }

  function metaExcel() {
    const s = st(), c = s.cfdis[0];
    const receptor = c ? [c.receptorNombre, c.receptorRFC].filter(Boolean).join(' · ') : 'Contribuyente';
    const fuente = !s.fuente ? '' : s.fuente.tipo === 'caso' ? 'listado del caso de práctica (datos ficticios)'
      : s.fuente.tipo === 'servidor' ? 'copia diaria del portal de datos abiertos del SAT' : 'archivo cargado manualmente: ' + s.fuente.nombre;
    return { contribuyente: receptor + (modo === 'demo' ? ' (modo DEMO)' : ''), fuenteListado: fuente };
  }

  function renderExportar() {
    $('#exportar').innerHTML = `
      <button type="button" class="btn btn--primario" data-exp="xlsx">${ico('i-bajar')}Descargar entregables en Excel (.xlsx)</button>
      <button type="button" class="btn btn--secundario" data-exp="ops">${ico('i-bajar')}Tabla por operación (CSV)</button>
      <button type="button" class="btn btn--secundario" data-exp="prov">${ico('i-bajar')}Resumen por proveedor (CSV)</button>
      <button type="button" class="btn btn--secundario" data-exp="imprimir">${ico('i-imprimir')}Imprimir o guardar PDF</button>`;
  }

  function exportar(tipo) {
    const res = st().resultado; if (!res) return;
    st().descargado = true;
    const base = `revisor69b_${modo}_${res.fechaRevision}`;
    if (tipo === 'xlsx') R69.xlsx.descargarXLSX(base + '_entregables.xlsx', R69.xlsx.libroEntregables(res, metaExcel()));
    else if (tipo === 'ops') E.descargar(base + '_operaciones.csv', E.csvOperaciones(res));
    else if (tipo === 'prov') E.descargar(base + '_proveedores.csv', E.csvProveedores(res));
    else window.print();
  }

  function renderParametrosISR() {
    const s = st();
    $('#parametros-isr').innerHTML = `
      <div class="campo">
        <label for="isr-modo">Estimación de ISR (opcional, se muestra por separado)</label>
        <select id="isr-modo">
          <option value="no">No mostrar estimación</option>
          <option value="pm">Persona moral — tasa del 30 %</option>
          <option value="otra">Otra tasa (según el régimen del cliente)</option>
        </select>
        <span class="ayuda">La deducción comprometida es el importe potencial (SubTotal − Descuento). El ISR estimado es solo una referencia y depende del régimen del cliente.</span>
      </div>
      <div class="campo" id="isr-otra" hidden>
        <label for="isr-tasa">Tasa de ISR (%)</label>
        <input type="number" id="isr-tasa" min="0" max="35" step="0.01" value="${s.isr.tasa}">
        <label for="isr-regimen">Régimen del cliente</label>
        <input type="text" id="isr-regimen" placeholder="Ej. persona física con actividad empresarial" value="${h(s.isr.regimen)}">
      </div>`;
    $('#isr-modo').value = s.isr.modo;
    $('#isr-otra').hidden = s.isr.modo !== 'otra';
  }

  function opcionesISR(s) {
    if (s.isr.modo === 'pm') return { tasaISR: 0.30, regimenISR: 'Persona moral' };
    if (s.isr.modo === 'otra') return { tasaISR: Math.max(0, s.isr.tasa) / 100, regimenISR: s.isr.regimen };
    return { tasaISR: null, regimenISR: '' };
  }

  /** Ejecuta la revisión. Con tablaCompleta=false no vuelve a pintar la tabla (para no perder el foco al ajustar importes). */
  function recalcular(tablaCompleta) {
    const s = st();
    s.resultado = C.revisar(s.cfdis, s.listado, Object.assign({ fechaRevision: s.fechaRevision, fechaDatos: s.fechaDatos, ajustes: s.ajustes }, opcionesISR(s)));
    renderKPIs(); renderImpacto(); renderAcciones(); renderResumenTabla();
    if (tablaCompleta !== false) { renderOperaciones(); renderExportar(); }
  }

  // ====================== Listado del 69-B ======================
  function fechaHora(iso) {
    if (!iso) return 'sin dato';
    const f = new Date(iso); if (isNaN(f)) return h(iso);
    return f.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
  }

  function pintarEstadoListado(mensajeError) {
    const s = st(), cont = $('#listado-estado');
    if (mensajeError) { cont.innerHTML = `<div class="aviso aviso--medio">${ico('i-alerta')}<div>${mensajeError}</div></div>`; return; }
    if (!s.listado) { cont.innerHTML = '<p class="secundario">Aún no se ha cargado un listado.</p>'; return; }
    const L = s.listado, F = s.fuente;
    const filas = [];
    if (F.tipo === 'caso') {
      filas.push(['Fuente', `Listado del caso de práctica «Revisor de proveedores 69-B» (datos ficticios): ${h(F.nombre)}`]);
    } else if (F.tipo === 'servidor') {
      filas.push(['Fuente', 'Copia guardada en este sitio, descargada del portal de datos abiertos del SAT por la tarea automática diaria.']);
      filas.push(['Última descarga exitosa', fechaHora(F.meta.ultimaDescargaExitosa)]);
      if (F.meta.contenidoSinCambiosDesde && F.meta.contenidoSinCambiosDesde !== F.meta.ultimaDescargaExitosa) filas.push(['Contenido sin cambios desde', fechaHora(F.meta.contenidoSinCambiosDesde)]);
      filas.push(['Actualización indicada por el SAT', F.meta.lastModifiedSAT ? fechaHora(F.meta.lastModifiedSAT) + ' (fecha del archivo en el servidor del SAT)' : 'El SAT no informó la fecha del archivo.']);
    } else {
      filas.push(['Fuente', `Archivo cargado manualmente: ${h(F.nombre)}`]);
      filas.push(['Fecha del archivo en tu equipo', F.fechaArchivo ? fechaHora(new Date(F.fechaArchivo).toISOString()) : 'sin dato']);
    }
    filas.push(['Leyenda del listado', L.actualizadoAl ? `«Información actualizada al ${h(L.actualizadoAl)}»` : 'El archivo no trae leyenda de actualización.']);
    filas.push(['Registros', `${L.registros.length.toLocaleString('es-MX')} — ${Object.entries(L.conteos).filter(([k, v]) => k !== 'Otra' || v).map(([k, v]) => `${h(k)} ${v.toLocaleString('es-MX')}`).join(' · ')}`]);
    filas.push(['RFC con varios episodios', `${L.rfcConVariosEpisodios.toLocaleString('es-MX')} (se muestran todos sus episodios; si se contradicen: «Requiere revisión documental»)`]);
    const adv = L.advertencias.length ? `<details class="detalle"><summary>${L.advertencias.length} advertencia${L.advertencias.length === 1 ? '' : 's'} del archivo (no bloquean)</summary><ul class="registro-carga">${L.advertencias.slice(0, 200).map(a => `<li>${h(a)}</li>`).join('')}</ul></details>` : '';
    const aviso = s.avisoListado ? `<div class="aviso aviso--medio" style="margin-top:12px">${ico('i-alerta')}<p>${s.avisoListado}</p></div>` : '';
    cont.innerHTML = `<div class="aviso aviso--bajo">${ico('i-ok')}<p>Listado cargado. Se usará para la revisión.</p></div><dl>${filas.map(([k, v]) => `<dt>${h(k)}</dt><dd>${v}</dd>`).join('')}</dl>${adv}${aviso}`;
  }

  function fijarListado(destino, listado, fuente, aviso) {
    const s = estado[destino];
    s.listado = listado; s.fuente = fuente; s.avisoListado = aviso || '';
    const fLocal = (iso) => { const f = new Date(iso); return isNaN(f) ? '' : `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`; };
    const descarga = fuente.tipo === 'servidor' && fuente.meta.ultimaDescargaExitosa ? `descarga del ${fLocal(fuente.meta.ultimaDescargaExitosa)}` : (fuente.tipo === 'manual' ? `archivo ${fuente.nombre}` : '');
    s.fechaDatos = [listado.actualizadoAl || '', descarga].filter(Boolean).join(' · ');
    if (destino === modo) { pintarEstadoListado(); if (s.resultado) recalcular(true); actualizarBoton(); }
  }

  async function cargarListadoServidor() {
    const b = $('#cargar-listado');
    b.disabled = true;
    $('#listado-estado').innerHTML = '<p class="cargando">Cargando la copia guardada del listado…</p>';
    try {
      if (location.protocol === 'file:') throw new Error('archivo-local');
      const rm = await fetch('data/69b/meta.json', { cache: 'no-store' });
      if (rm.status === 404) throw new Error('sin-copia');
      if (!rm.ok) throw new Error('HTTP ' + rm.status);
      const meta = await rm.json();
      const rc = await fetch('data/69b/Listado_completo_69-B.csv', { cache: 'no-store' });
      if (!rc.ok) throw new Error(rc.status === 404 ? 'sin-copia' : 'HTTP ' + rc.status);
      const listado = R69.csv.leerListado(R69.csv.decodificar(new Uint8Array(await rc.arrayBuffer())));
      const v = R69.csv.validarListado(listado, { minimoRegistros: 5000 });
      if (!v.ok) throw new Error('La copia guardada no pasó la validación: ' + v.errores.join(' '));
      fijarListado('real', listado, { tipo: 'servidor', meta });
    } catch (e) {
      const m = e.message === 'archivo-local'
        ? '<p>La aplicación está abierta como archivo local, así que no puede leer la copia guardada del listado. Ábrela desde GitHub Pages o desde tu sitio web, o usa <strong>«Cargar CSV descargado del SAT»</strong>.</p>'
        : e.message === 'sin-copia'
          ? '<p>Todavía no hay un listado guardado en este sitio: la tarea automática lo descarga una vez al día. Mientras tanto, usa <strong>«Cargar CSV descargado del SAT»</strong>.</p>'
          : `<p>No se pudo cargar la copia guardada (${h(e.message)}). Puedes usar <strong>«Cargar CSV descargado del SAT»</strong>.</p>`;
      if (modo === 'real') {
        if (estado.real.listado) { pintarEstadoListado(); $('#listado-estado').insertAdjacentHTML('afterbegin', `<div class="aviso aviso--medio" style="margin-bottom:12px">${ico('i-alerta')}<div>${m}<p>Se conserva el listado que ya estaba cargado.</p></div></div>`); }
        else pintarEstadoListado(m);
      }
    } finally { b.disabled = false; }
  }

  async function cargarListadoManual(archivo) {
    if (!archivo) return;
    $('#listado-estado').innerHTML = '<p class="cargando">Leyendo el archivo…</p>';
    try {
      const listado = R69.csv.leerListado(R69.csv.decodificar(new Uint8Array(await archivo.arrayBuffer())));
      const v = R69.csv.validarListado(listado, { minimoRegistros: 1 });
      if (!v.ok) throw new Error(v.errores.join(' '));
      const aviso = listado.registros.length < 5000 ? `El archivo tiene solo ${listado.registros.length} registros. El listado completo del SAT tiene más de 10,000: verifica que sea el «Listado completo 69-B».` : '';
      fijarListado('real', listado, { tipo: 'manual', nombre: archivo.name, fechaArchivo: archivo.lastModified }, aviso);
    } catch (e) {
      if (estado.real.listado) { pintarEstadoListado(); $('#listado-estado').insertAdjacentHTML('afterbegin', `<div class="aviso aviso--alto" style="margin-bottom:12px">${ico('i-alerta')}<p>No se usó «${h(archivo.name)}»: ${h(e.message)} Se conserva el listado anterior.</p></div>`); }
      else pintarEstadoListado(`<p>No se pudo usar «${h(archivo.name)}»: ${h(e.message)}</p>`);
    }
  }

  // ====================== CFDI ======================
  function textoXML(bytes) {
    let enc = 'utf-8';
    const cab = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
    const m = /encoding=["']([\w.\-]+)["']/i.exec(cab);
    if (m) enc = m[1];
    try { return new TextDecoder(enc).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
  }

  function agregarTexto(s, texto, nombre) {
    const r = R69.cfdi.leerCFDI(texto, nombre);
    if (!r.ok) { s.registro.errores.push({ archivo: nombre, motivo: r.motivo }); return; }
    const c = r.cfdi;
    if (c.tipo !== 'I') { s.registro.omitidos.push({ archivo: nombre, motivo: `Tipo ${c.tipo} (${c.tipoTexto}): solo se analizan comprobantes de Ingreso.` }); return; }
    if (s.porUUID.has(c.uuid)) { s.registro.omitidos.push({ archivo: nombre, motivo: `Duplicado: el UUID ${c.uuid} ya se cargó desde «${s.porUUID.get(c.uuid).archivo}».` }); return; }
    s.porUUID.set(c.uuid, c); s.cfdis.push(c);
  }

  /** Procesa archivos sueltos o los de una carpeta. Con deCarpeta, lo que no es XML ni ZIP se ignora y solo se cuenta. */
  async function procesarArchivos(lista, deCarpeta) {
    const s = st();
    let archivos = Array.from(lista || []);
    let ignorados = 0;
    if (deCarpeta) {
      const utiles = archivos.filter(a => /\.(xml|zip)$/i.test(a.name));
      ignorados = archivos.length - utiles.length;
      archivos = utiles;
    }
    s.ignoradosCarpeta = deCarpeta ? ignorados : null;
    s.mensajeNuevo = false;
    if (!archivos.length) {
      if (deCarpeta) { pintarResumenCFDI(); $('#cfdi-resumen').insertAdjacentHTML('afterbegin', `<div class="aviso aviso--medio">${ico('i-alerta')}<p>La carpeta no contiene archivos XML ni ZIP${ignorados ? ` (${ignorados === 1 ? 'se ignoró 1 archivo' : `se ignoraron ${ignorados} archivos`} de otro tipo)` : ''}.</p></div>`); }
      return;
    }
    $('#cfdi-resumen').innerHTML = `<p class="cargando">Procesando ${archivos.length} archivo(s)…</p>`;
    const antes = s.cfdis.length;
    for (const a of archivos) {
      const nombre = a.webkitRelativePath || a.rutaCarpeta || a.name, bytes = new Uint8Array(await a.arrayBuffer());
      try {
        if (/\.zip$/i.test(nombre)) {
          const z = await R69.zip.extraerXML(bytes, nombre);
          z.omitidos.forEach(o => s.registro.omitidos.push({ archivo: nombre + ' › ' + o.nombre, motivo: o.motivo }));
          z.archivos.forEach(x => agregarTexto(s, textoXML(x.bytes), nombre + ' › ' + x.nombre));
        } else if (/\.xml$/i.test(nombre)) agregarTexto(s, textoXML(bytes), nombre);
        else s.registro.omitidos.push({ archivo: nombre, motivo: 'No es un archivo XML ni ZIP.' });
      } catch (e) { s.registro.errores.push({ archivo: nombre, motivo: e.message }); }
    }
    s.ultimaCarga = s.cfdis.length - antes;
    s.resultado = null; $('#resultados').hidden = true;
    pintarResumenCFDI();
    actualizarBoton();
  }

  /** Lee los archivos de lo que se arrastró, entrando en carpetas y subcarpetas (API de entradas del navegador). */
  async function archivosArrastrados(dt) {
    const items = Array.from(dt.items || []).filter(i => i.kind === 'file');
    const entradas = items.map(i => i.webkitGetAsEntry ? i.webkitGetAsEntry() : null);
    if (!entradas.some(e => e && e.isDirectory)) return { archivos: Array.from(dt.files || []), carpeta: false };
    const archivos = [];
    const leerArchivo = (entrada) => new Promise((ok, mal) => entrada.file(f => { f.rutaCarpeta = entrada.fullPath.replace(/^\//, ''); ok(f); }, mal));
    const leerLote = (lector) => new Promise((ok, mal) => lector.readEntries(ok, mal));
    async function recorrer(entrada) {
      if (!entrada) return;
      if (entrada.isFile) { archivos.push(await leerArchivo(entrada)); return; }
      const lector = entrada.createReader();
      for (let lote = await leerLote(lector); lote.length; lote = await leerLote(lector)) {
        for (const e of lote) await recorrer(e);
      }
    }
    for (const e of entradas) await recorrer(e);
    return { archivos, carpeta: true };
  }

  function limpiarCFDI(s) {
    s.cfdis = []; s.porUUID = new Map(); s.registro = { omitidos: [], errores: [] }; s.ajustes = {}; s.ultimaCarga = null; s.ignoradosCarpeta = null; s.resultado = null;
  }

  /** Carga los 40 CFDI del caso de práctica en el estado DEMO. */
  function cargarCFDICaso() {
    const s = estado.demo;
    limpiarCFDI(s);
    window.R69_DEMO.cfdi.forEach(c => agregarTexto(s, c.xml, c.archivo));
    s.ultimaCarga = s.cfdis.length;
  }

  function pintarResumenCFDI() {
    const s = st(), reg = s.registro, cont = $('#cfdi-resumen');
    if (!s.cfdis.length && !reg.omitidos.length && !reg.errores.length) {
      cont.innerHTML = s.mensajeNuevo ? `<div class="aviso aviso--bajo" style="margin-top:12px">${ico('i-ok')}<p><strong>Listo para iniciar un nuevo análisis.</strong> Carga los CFDI del siguiente cliente; el listado 69-B se conservó.</p></div>` : '';
      return;
    }
    const receptores = [...new Set(s.cfdis.map(c => c.receptorRFC))];
    const lista = (titulo, items) => items.length ? `<details class="detalle"><summary>${h(titulo)} (${items.length})</summary><ul class="registro-carga">${items.slice(0, 500).map(x => `<li><span class="mono">${h(x.archivo)}</span>: ${h(x.motivo)}</li>`).join('')}</ul></details>` : '';
    cont.innerHTML = `
      <ul class="carga-resumen">
        <li><span class="etiqueta-sit nivel-bajo">${s.cfdis.length} CFDI válidos</span></li>
        <li><span class="etiqueta-sit nivel-medio">${reg.omitidos.length} omitidos</span></li>
        <li><span class="etiqueta-sit nivel-alto">${reg.errores.length} con error</span></li>
      </ul>
      ${s.ultimaCarga != null ? `<p class="pequeno secundario">Última carga: ${s.ultimaCarga} comprobante(s) nuevo(s)${s.ignoradosCarpeta ? `; ${s.ignoradosCarpeta === 1 ? 'se ignoró 1 archivo de la carpeta que no es' : `se ignoraron ${s.ignoradosCarpeta} archivos de la carpeta que no son`} XML ni ZIP` : ''}.</p>` : ''}
      ${receptores.length > 1 ? `<div class="aviso aviso--medio">${ico('i-alerta')}<p>Los CFDI corresponden a ${receptores.length} receptores distintos (${receptores.map(h).join(', ')}). Verifica que sean del mismo cliente.</p></div>` : receptores.length ? `<p class="pequeno">Receptor: <span class="mono">${h(receptores[0])}</span></p>` : ''}
      ${reg.omitidos.some(o => /^Tipo E\b/.test(o.motivo)) ? `<div class="aviso aviso--medio">${ico('i-alerta')}<p>Se omitieron CFDI de Egreso (notas de crédito). Si alguno corresponde a un proveedor listado, el IVA y la deducción comprometidos pueden estar sobrestimados: ajústalos en la tabla por operación.</p></div>` : ''}
      ${lista('Comprobantes omitidos', reg.omitidos)}${lista('Archivos con error', reg.errores)}`;
  }

  function actualizarBoton() {
    const s = st();
    $('#ejecutar').disabled = !(s.listado && s.cfdis.length);
    $('#estado-ejecucion').textContent = !s.listado ? 'Falta cargar el listado 69-B.' : !s.cfdis.length ? 'Falta cargar los CFDI.' : `Listo para ejecutar (${s.cfdis.length} CFDI).`;
  }

  // ====================== Inicio ======================
  function bytesDeBase64(b64) {
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ====================== Nuevo análisis ======================
  /** Pide confirmación (si hay datos) y reinicia el análisis del modo actual. */
  function pedirNuevoAnalisis() {
    const s = st();
    const hayDatos = s.cfdis.length || s.resultado || s.registro.omitidos.length || s.registro.errores.length;
    if (!hayDatos) { iniciarNuevoAnalisis(); return; }
    const sinDescargar = !!s.resultado && !s.descargado;
    const dlg = $('#dialogo-nuevo');
    if (!dlg || typeof dlg.showModal !== 'function') {
      const texto = 'Se eliminarán los CFDI y los resultados del análisis actual. El listado 69-B se conservará. ¿Deseas iniciar un nuevo análisis?' +
        (sinDescargar ? '\n\nAún no descargaste los entregables de este análisis.' : '');
      if (window.confirm(texto)) iniciarNuevoAnalisis();
      return;
    }
    $('#dialogo-nuevo-recordatorio').hidden = !sinDescargar;
    dlg.returnValue = '';
    dlg.addEventListener('close', () => { if (dlg.returnValue === 'confirmar') iniciarNuevoAnalisis(); }, { once: true });
    dlg.showModal();
    $('#dialogo-nuevo-cancelar').focus();
  }

  /** Borra CFDI, resultados, ajustes, filtros y búsqueda; conserva el listado y el modo. */
  function iniciarNuevoAnalisis() {
    const s = st();
    limpiarCFDI(s);
    s.filtro = 'TODOS'; s.busqueda = ''; s.descargado = false; s.mensajeNuevo = true;
    s.fechaRevision = modo === 'demo' ? FECHA_DEMO : U.hoyISO();
    $('#fecha-revision').value = s.fechaRevision;
    $('#resultados').hidden = true;
    pintarResumenCFDI();
    actualizarBoton();
    $('#cfdi').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#zona-carga').focus({ preventScroll: true });
  }

  function enlazarEventos() {
    // Listado (solo REAL)
    $('#cargar-listado').addEventListener('click', cargarListadoServidor);
    $('#csv-manual').addEventListener('change', e => { cargarListadoManual(e.target.files[0]); e.target.value = ''; });

    // CFDI
    const zona = $('#zona-carga'), input = $('#cfdi-input');
    input.addEventListener('change', e => { procesarArchivos(e.target.files); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.add('arrastrando'); }));
    ['dragleave', 'drop'].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.remove('arrastrando'); }));
    zona.addEventListener('drop', async e => {
      try { const r = await archivosArrastrados(e.dataTransfer); procesarArchivos(r.archivos, r.carpeta); }
      catch (err) { procesarArchivos(e.dataTransfer.files); }
    });
    const carpeta = $('#carpeta-input');
    if (!('webkitdirectory' in carpeta)) $('#carga-carpeta').hidden = true;  // el navegador no permite elegir carpetas
    carpeta.addEventListener('change', e => { procesarArchivos(e.target.files, true); e.target.value = ''; });
    zona.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    zona.tabIndex = 0;

    // Parámetros
    const f = $('#fecha-revision');
    f.addEventListener('change', () => { if (f.value) { st().fechaRevision = f.value; if (st().resultado) recalcular(true); } });
    $('#parametros-isr').addEventListener('change', () => {
      const s = st();
      s.isr.modo = $('#isr-modo').value;
      s.isr.tasa = parseFloat($('#isr-tasa').value) || 0;
      s.isr.regimen = $('#isr-regimen').value.trim();
      $('#isr-otra').hidden = s.isr.modo !== 'otra';
      if (s.resultado) recalcular(false);
    });
    $$('[data-accion="nuevo-analisis"]').forEach(b => b.addEventListener('click', pedirNuevoAnalisis));
    $('#restaurar-caso').addEventListener('click', () => {
      cargarCFDICaso(); estado.demo.mensajeNuevo = false; $('#resultados').hidden = true; pintarResumenCFDI(); actualizarBoton();
    });
    $('#ejecutar').addEventListener('click', () => {
      const b = $('#ejecutar'), aviso = $('#estado-ejecucion');
      st().descargado = false; st().mensajeNuevo = false;
      b.disabled = true;
      aviso.innerHTML = '<span class="cargando">Procesando…</span>';
      // Se cede un instante al navegador para que muestre «Procesando…» antes del cálculo
      setTimeout(() => {
        const t0 = performance.now();
        try {
          recalcular(true);
          $('#resultados').hidden = false;
          $('#resultados').scrollIntoView({ behavior: 'smooth', block: 'start' });
          aviso.textContent = `Revisión lista: ${st().resultado.operaciones.length} CFDI en ${Math.max(1, Math.round(performance.now() - t0))} ms.`;
        } catch (e) {
          aviso.textContent = 'No se pudo completar la revisión: ' + e.message;
        } finally { b.disabled = !(st().listado && st().cfdis.length); }
      }, 30);
    });

    // Resultados: filtros, búsqueda, ajustes de importes y exportación
    const ops = $('#operaciones');
    ops.addEventListener('click', e => {
      const b = e.target.closest('[data-filtro]'); if (!b) return;
      st().filtro = b.dataset.filtro;
      $$('[data-filtro]', ops).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      pintarCuerpoOperaciones();
    });
    ops.addEventListener('input', e => {
      if (e.target.type === 'search') { st().busqueda = e.target.value; pintarCuerpoOperaciones(); }
    });
    ops.addEventListener('change', e => {
      const i = e.target; if (!i.dataset || !i.dataset.uuid) return;
      const s = st();
      const op = s.resultado.operaciones.find(o => o.uuid === i.dataset.uuid);
      const potencial = i.dataset.campo === 'deduccion' ? op.deduccionPotencial : op.iva;
      const v = i.value === '' ? null : Math.max(0, parseFloat(i.value) || 0);
      s.ajustes[op.uuid] = s.ajustes[op.uuid] || {};
      if (v == null || Math.abs(v - potencial) < 0.005) delete s.ajustes[op.uuid][i.dataset.campo];
      else s.ajustes[op.uuid][i.dataset.campo] = v;
      if (v == null) i.value = potencial.toFixed(2);
      recalcular(false);
    });
    $('#exportar').addEventListener('click', e => { const b = e.target.closest('[data-exp]'); if (b) exportar(b.dataset.exp); });
  }

  function iniciar() {
    // DEMO: listado del caso y sus 40 CFDI precargados
    const D = window.R69_DEMO;
    fijarListado('demo', R69.csv.leerListado(R69.csv.decodificar(bytesDeBase64(D.csvBase64))), { tipo: 'caso', nombre: D.archivoListado || 'Listado_Completo_69-B.csv' });
    cargarCFDICaso();

    enlazarEventos();
    iniciarModos();
    const inicial = location.hash === '#real' ? 'real' : location.hash === '#demo' ? 'demo' : (leer('modo') || 'demo');
    cambiarModo(inicial);
  }

  // Al imprimir, abrir los detalles para que aparezcan en el PDF
  window.addEventListener('beforeprint', () => { $$('details').forEach(d => { d.dataset.abierto = d.open ? '1' : ''; d.open = true; }); });
  window.addEventListener('afterprint', () => { $$('details').forEach(d => { d.open = d.dataset.abierto === '1'; }); });

  iniciarTamano();
  iniciar();
})();
