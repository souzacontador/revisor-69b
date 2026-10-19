/* Revisor de Proveedores 69-B — interfaz (modos DEMO y REAL). */
(function () {
  'use strict';
  const U = R69.util, C = R69.clasificador, E = R69.exportar;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const h = U.escaparHTML;
  const ico = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;

  const PROMPT_INICIAL = `Voy a construir con tu ayuda un revisor de proveedores contra el listado del artículo 69-B del CFF. Tengo dos insumos:
1. 40 CFDI de gastos (XML, CFDI 4.0) recibidos por mi cliente en 2026.
2. El listado completo del 69-B en CSV, con la estructura del que publica el SAT: tres renglones de título antes del encabezado, codificación Windows-1252 y una columna de situación (Presunto, Desvirtuado, Definitivo o Sentencia Favorable) con sus fechas de publicación.

Ayúdame a construir, paso a paso, una herramienta que:
- lea el RFC del emisor, la fecha, el subtotal y el IVA de cada CFDI;
- cruce cada emisor contra el listado por RFC (nunca por nombre), normalizando mayúsculas y espacios;
- clasifique cada operación según la situación del proveedor y sus fechas de publicación;
- sume, por proveedor, el IVA acreditado y la deducción de ISR que quedan en riesgo o sin efecto;
- calcule, para cada definitivo, el plazo de 30 días que da el artículo 69-B para acreditar la materialidad o corregirse, contando días hábiles conforme al artículo 12 del CFF.

Empecemos por definir la estructura del revisor y cómo leer el CSV sin romper los acentos.`;

  // Evidencia de materialidad sugerida (fuente: cuaderno «Curso Fiscalización 2026 DSV», manuales M3/M5)
  const EVIDENCIA = [
    ['Capacidad del proveedor', 'activos, personal (registros IMSS, CFDI de nómina), infraestructura (domicilio operativo, servicios) y capacidad material o subcontratistas.'],
    ['Lógica de negocio', 'necesidad documentada antes de contratar, contrato u orden de compra con alcance, entregables, plazos y precio; fecha cierta en operaciones relevantes; precio razonable.'],
    ['Ejecución y recepción', 'entregables, bitácoras, minutas, correos con sus metadatos originales, remisiones, registros de almacén, cartas porte, fotografías con fecha.'],
    ['Terceros independientes', 'guías de transportistas, manifiestos u otra evidencia que no provenga del proveedor.'],
    ['Trazabilidad financiera', 'estados de cuenta que acrediten el pago desde la cuenta de la empresa a una cuenta del emisor del CFDI.']
  ];

  const estado = {
    demo: { listado: null, cfdis: [], resultado: null, ajustes: {}, isr: { modo: 'no', tasa: 30, regimen: '' }, fechaRevision: '2026-09-30', fechaDatos: '', filtro: 'TODOS', busqueda: '' },
    real: { listado: null, fuente: null, cfdis: [], porUUID: new Map(), registro: { omitidos: [], errores: [] }, resultado: null, ajustes: {}, isr: { modo: 'no', tasa: 30, regimen: '' }, fechaRevision: U.hoyISO(), fechaDatos: '', filtro: 'TODOS', busqueda: '' }
  };
  const IDS = {
    demo: { kpis: '#demo-kpis', operaciones: '#demo-operaciones', impacto: '#demo-impacto', acciones: '#demo-acciones', exportar: '#demo-exportar', isr: '#demo-parametros-isr', resumen: '#demo-resumen-tabla' },
    real: { kpis: '#real-kpis', operaciones: '#real-operaciones', impacto: '#real-impacto', acciones: '#real-acciones', exportar: '#real-exportar', isr: '#real-parametros-isr', resumen: '#real-resumen-tabla' }
  };

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
    const activar = (modo, enfocar) => {
      tabs.forEach(t => {
        const sel = t.id === 'tab-' + modo;
        t.setAttribute('aria-selected', String(sel)); t.tabIndex = sel ? 0 : -1;
        $('#' + t.getAttribute('aria-controls')).hidden = !sel;
        if (sel && enfocar) t.focus();
      });
      guardar('modo', modo);
      if (location.hash !== '#' + modo && (location.hash === '#demo' || location.hash === '#real' || !location.hash)) history.replaceState(null, '', '#' + modo);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => activar(t.id.slice(4)));
      t.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); activar(tabs[(i + 1) % 2].id.slice(4), true); }
      });
    });
    // Un enlace a una sección (#paso-3, #entregables…) abre el modo que la contiene
    let ancla = null;
    try { ancla = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null; } catch (e) { ancla = null; }
    const porAncla = ancla && ancla.closest('#vista-real') ? 'real' : ancla && ancla.closest('#vista-demo') ? 'demo' : null;
    const inicial = location.hash === '#real' ? 'real' : location.hash === '#demo' ? 'demo' : (porAncla || leer('modo') || 'demo');
    activar(inicial === 'real' ? 'real' : 'demo');
    if (ancla && porAncla) setTimeout(() => ancla.scrollIntoView(), 0);
  }

  function iniciarPasos() {
    const enlaces = $$('.pasos a');
    if (!('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(entradas => {
      entradas.forEach(en => {
        if (en.isIntersecting) enlaces.forEach(a => a.classList.toggle('activo', a.getAttribute('href') === '#' + en.target.id));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    enlaces.forEach(a => { const s = $(a.getAttribute('href')); if (s) obs.observe(s); });
  }

  // ====================== Componentes de resultados ======================
  function etiquetaSituacion(sit) {
    const nivel = sit === 'Definitivo' ? 'alto' : sit === 'Presunto' ? 'medio' : (sit === 'Desvirtuado' || sit === 'Sentencia Favorable') ? 'bajo' : sit === 'No listado' ? 'info' : 'medio';
    return `<span class="etiqueta-sit nivel-${nivel}${nivel === 'info' ? ' sin-punto' : ''}">${h(sit)}</span>`;
  }
  function etiquetaVeredicto(v) { return `<span class="etiqueta-sit nivel-${v.nivel}">${h(v.corto || v.texto)}</span>`; }

  function renderKPIs(modo) {
    const st = estado[modo], r = st.resultado, t = r.totales;
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
    $(IDS[modo].kpis).innerHTML = `
      <div class="franja-datos" role="status">
        <span><b>${r.operaciones.length}</b> CFDI analizados</span>
        <span><b>${r.emisores}</b> proveedores</span>
        <span><b>${r.listados}</b> en el listado 69-B</span>
        <span>Fecha de revisión: <b>${U.fechaMX(r.fechaRevision)}</b></span>
        <span>Listado consultado: <b>${h(r.fechaDatos || 'sin fecha')}</b></span>
      </div>
      <div class="rejilla rejilla--${tarjetas.length === 4 ? '4' : '3'}" style="margin-top:16px">${tarjetas.join('')}</div>`;
  }

  function filasOperaciones(modo) {
    const st = estado[modo], q = U.claveTexto(st.busqueda);
    return st.resultado.operaciones.filter(o =>
      (st.filtro === 'TODOS' || o.veredicto.clave === st.filtro) &&
      (!q || U.claveTexto(o.proveedor + ' ' + o.rfc + ' ' + o.uuid).includes(q)));
  }

  function renderOperaciones(modo) {
    const st = estado[modo], r = st.resultado, cont = $(IDS[modo].operaciones);
    const cuenta = k => r.operaciones.filter(o => o.veredicto.clave === k).length;
    const chips = [['TODOS', 'Todas', r.operaciones.length], ['SIN_EFECTO', 'Sin efecto fiscal', cuenta('SIN_EFECTO')], ['EN_RIESGO', 'En riesgo', cuenta('EN_RIESGO')], ['REVISION', 'Revisión documental', cuenta('REVISION')], ['SIN_RIESGO', 'Sin riesgo', cuenta('SIN_RIESGO')]]
      .filter(c => c[0] === 'TODOS' || c[2] > 0);
    cont.innerHTML = `
      <h3>Tabla por operación</h3>
      <div class="filtros no-imprimir" role="group" aria-label="Filtrar operaciones">
        ${chips.map(c => `<button type="button" class="chip" data-filtro="${c[0]}" aria-pressed="${st.filtro === c[0]}">${h(c[1])} (${c[2]})</button>`).join('')}
        <div class="buscar"><label class="oculto-visual" for="${modo}-buscar">Buscar por proveedor, RFC o UUID</label>
          <input type="search" id="${modo}-buscar" placeholder="Buscar proveedor, RFC o UUID" value="${h(st.busqueda)}"></div>
      </div>
      <div class="tabla-envoltura tabla-tarjetas"><table>
        <caption class="oculto-visual">Operaciones clasificadas</caption>
        <thead><tr><th scope="col">UUID</th><th scope="col">Proveedor</th><th scope="col">RFC</th><th scope="col">Fecha</th><th scope="col" class="num">Subtotal</th><th scope="col" class="num">IVA</th><th scope="col">Situación del proveedor y veredicto</th><th scope="col">Importes comprometidos</th></tr></thead>
        <tbody></tbody><tfoot></tfoot></table></div>`;
    pintarCuerpoOperaciones(modo);
  }

  function pintarCuerpoOperaciones(modo) {
    const st = estado[modo], cont = $(IDS[modo].operaciones);
    const filas = filasOperaciones(modo);
    const tb = $('tbody', cont), tf = $('tfoot', cont);
    if (!filas.length) { tb.innerHTML = `<tr><td colspan="8" class="ancho-completo">No hay operaciones con este filtro.</td></tr>`; tf.innerHTML = ''; return; }
    tb.innerHTML = filas.map(o => {
      const aj = st.ajustes[o.uuid] || {};
      const editable = o.veredicto.clave !== 'SIN_RIESGO';
      const importes = editable ? `<div class="ajuste">
          <label for="aj-d-${modo}-${o.uuid}">Deducido (ISR)</label>
          <input type="number" inputmode="decimal" step="0.01" min="0" id="aj-d-${modo}-${o.uuid}" data-uuid="${o.uuid}" data-campo="deduccion" value="${aj.deduccion != null ? aj.deduccion : o.deduccionPotencial.toFixed(2)}">
          <label for="aj-i-${modo}-${o.uuid}">IVA acreditado</label>
          <input type="number" inputmode="decimal" step="0.01" min="0" id="aj-i-${modo}-${o.uuid}" data-uuid="${o.uuid}" data-campo="iva" value="${aj.iva != null ? aj.iva : o.iva.toFixed(2)}">
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
    const sum = k => U.deCentavos(filas.reduce((s, o) => s + U.centavos(o[k]), 0));
    tf.innerHTML = `<tr><td colspan="4">Total de las ${filas.length} operaciones mostradas</td><td class="num">${U.moneda(sum('subtotal'))}</td><td class="num">${U.moneda(sum('iva'))}</td><td colspan="2"></td></tr>`;
  }

  function lineaTiempo(fechas) {
    const clase = { 'Presunto': 'presunto', 'Desvirtuado': 'desvirtuado', 'Definitivo': 'definitivo', 'Sentencia favorable': 'sentencia' };
    return `<ol class="linea-tiempo">${fechas.map(f => `<li class="etapa-${clase[f.etapa]}"><div><strong>${h(f.etapa)}</strong> · SAT ${f.fechaSAT ? U.fechaMX(f.fechaSAT) : 'sin fecha'} · DOF ${f.fechaDOF ? U.fechaMX(f.fechaDOF) : 'sin fecha'}
      ${f.oficioSAT || f.oficioDOF ? `<span class="oficio">Oficio SAT: ${h(f.oficioSAT || '—')} · Oficio DOF: ${h(f.oficioDOF || '—')}</span>` : ''}</div></li>`).join('')}</ol>`;
  }

  function renderImpacto(modo) {
    const st = estado[modo], r = st.resultado, cont = $(IDS[modo].impacto);
    if (!r.proveedores.length) { cont.innerHTML = `<div class="aviso aviso--bajo">${ico('i-ok')}<p>Ninguno de los ${r.emisores} proveedores aparece en el listado consultado (${h(r.fechaDatos)}).</p></div>`; return; }
    const comprometidos = r.proveedores.filter(p => p.veredicto.clave !== 'SIN_RIESGO');
    const sum = (k, lista) => U.deCentavos(lista.reduce((s, p) => s + U.centavos(p[k] || 0), 0));
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
      </div>
      ${comprometidos.length ? `<div class="franja-datos" style="margin-top:16px">
        <span>Total comprometido (${comprometidos.length} proveedor${comprometidos.length > 1 ? 'es' : ''} sin efecto, en riesgo o en revisión):</span>
        <span>IVA <b>${U.moneda(sum('ivaComprometido', comprometidos))}</b></span>
        <span>Deducción potencial <b>${U.moneda(sum('deduccion', comprometidos))}</b></span>
        ${conISR ? `<span>ISR estimado <b>${U.moneda(sum('isrEstimado', comprometidos))}</b></span>` : ''}
      </div>` : ''}`;
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

  function renderAcciones(modo) {
    const st = estado[modo], r = st.resultado, cont = $(IDS[modo].acciones);
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
  function renderResumenTabla(modo) {
    const r = estado[modo].resultado, cont = $(IDS[modo].resumen);
    if (!cont) return;
    if (!r.proveedores.length) { cont.innerHTML = `<p>Ninguno de los ${r.emisores} proveedores aparece en el listado consultado (${h(r.fechaDatos)}).</p>`; return; }
    const pubs = p => p.episodios.map((e, i) => (p.episodios.length > 1 ? `<strong>Episodio ${i + 1}</strong><br>` : '') + e.fechas.map(f =>
      `${h(f.etapa)}: SAT ${f.fechaSAT ? U.fechaMX(f.fechaSAT) : 's/f'} · DOF ${f.fechaDOF ? U.fechaMX(f.fechaDOF) : 's/f'}`).join('<br>')).join('<br>');
    const limite = p => {
      const pl = p.plazo;
      if (pl && pl.vence && p.episodios.length === 1) return `<span class="etiqueta-sit sin-punto ${pl.estado === 'VENCIDO' ? 'nivel-alto' : 'nivel-medio'}">${U.fechaMX(pl.vence)}${pl.estado === 'VENCIDO' ? ' · vencido' : ''}</span>`;
      return h(p.fechaLimite);
    };
    const comp = r.proveedores.filter(p => p.veredicto.clave !== 'SIN_RIESGO');
    const suma = k => U.deCentavos(comp.reduce((s, p) => s + U.centavos(p[k]), 0));
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

  function metaExcel(modo) {
    if (modo === 'demo') return { contribuyente: 'Contribuyente Demo Laboratorio SA de CV (datos ficticios)', fuenteListado: 'Listado_Completo_69-B.csv del caso de práctica' };
    const st = estado.real, c = st.cfdis[0];
    const receptor = c ? [c.receptorNombre, c.receptorRFC].filter(Boolean).join(' · ') : 'Contribuyente';
    const fuente = st.fuente && st.fuente.tipo === 'servidor' ? 'copia diaria del portal de datos abiertos del SAT' : (st.fuente ? 'archivo cargado manualmente: ' + st.fuente.nombre : '');
    return { contribuyente: receptor, fuenteListado: fuente };
  }

  function renderExportar(modo) {
    const r = estado[modo].resultado;
    const base = `revisor69b_${modo}_${r.fechaRevision}`;
    $(IDS[modo].exportar).innerHTML = `
      <button type="button" class="btn btn--primario" data-exp="xlsx">${ico('i-bajar')}Descargar entregables en Excel (.xlsx)</button>
      <button type="button" class="btn btn--secundario" data-exp="ops">${ico('i-bajar')}Tabla por operación (CSV)</button>
      <button type="button" class="btn btn--secundario" data-exp="prov">${ico('i-bajar')}Resumen por proveedor (CSV)</button>
      <button type="button" class="btn btn--secundario" data-exp="imprimir">${ico('i-imprimir')}Imprimir o guardar PDF</button>`;
    $(IDS[modo].exportar).onclick = (e) => {
      const b = e.target.closest('[data-exp]'); if (!b) return;
      const res = estado[modo].resultado;
      if (b.dataset.exp === 'xlsx') R69.xlsx.descargarXLSX(base + '_entregables.xlsx', R69.xlsx.libroEntregables(res, metaExcel(modo)));
      else if (b.dataset.exp === 'ops') E.descargar(base + '_operaciones.csv', E.csvOperaciones(res));
      else if (b.dataset.exp === 'prov') E.descargar(base + '_proveedores.csv', E.csvProveedores(res));
      else window.print();
    };
  }

  function renderParametrosISR(modo) {
    const st = estado[modo], cont = $(IDS[modo].isr);
    cont.innerHTML = `
      <div class="campo">
        <label for="${modo}-isr-modo">Estimación de ISR (opcional, se muestra por separado)</label>
        <select id="${modo}-isr-modo">
          <option value="no">No mostrar estimación</option>
          <option value="pm">Persona moral — tasa del 30 %</option>
          <option value="otra">Otra tasa (según el régimen del cliente)</option>
        </select>
        <span class="ayuda">La deducción comprometida es el importe potencial (SubTotal − Descuento). El ISR estimado es solo una referencia y depende del régimen del cliente.</span>
      </div>
      <div class="campo" id="${modo}-isr-otra" hidden>
        <label for="${modo}-isr-tasa">Tasa de ISR (%)</label>
        <input type="number" id="${modo}-isr-tasa" min="0" max="35" step="0.01" value="${st.isr.tasa}">
        <label for="${modo}-isr-regimen">Régimen del cliente</label>
        <input type="text" id="${modo}-isr-regimen" placeholder="Ej. persona física con actividad empresarial" value="${h(st.isr.regimen)}">
      </div>`;
    const sel = $(`#${modo}-isr-modo`, cont);
    sel.value = st.isr.modo;
    const sync = () => {
      st.isr.modo = sel.value;
      st.isr.tasa = parseFloat($(`#${modo}-isr-tasa`, cont).value) || 0;
      st.isr.regimen = $(`#${modo}-isr-regimen`, cont).value.trim();
      $(`#${modo}-isr-otra`, cont).hidden = sel.value !== 'otra';
      if (st.resultado) recalcular(modo, false);
    };
    cont.addEventListener('change', sync);
    $(`#${modo}-isr-otra`, cont).hidden = st.isr.modo !== 'otra';
  }

  function opcionesISR(st) {
    if (st.isr.modo === 'pm') return { tasaISR: 0.30, regimenISR: 'Persona moral' };
    if (st.isr.modo === 'otra') return { tasaISR: Math.max(0, st.isr.tasa) / 100, regimenISR: st.isr.regimen };
    return { tasaISR: null, regimenISR: '' };
  }

  /** Ejecuta la revisión. Con tablaCompleta=false no vuelve a pintar la tabla (para no perder el foco al ajustar importes). */
  function recalcular(modo, tablaCompleta) {
    const st = estado[modo];
    st.resultado = C.revisar(st.cfdis, st.listado, Object.assign({ fechaRevision: st.fechaRevision, fechaDatos: st.fechaDatos, ajustes: st.ajustes }, opcionesISR(st)));
    renderKPIs(modo); renderImpacto(modo); renderAcciones(modo); renderResumenTabla(modo);
    if (tablaCompleta !== false) { renderOperaciones(modo); renderExportar(modo); }
  }

  function enlazarTabla(modo) {
    const cont = $(IDS[modo].operaciones), st = estado[modo];
    cont.addEventListener('click', e => {
      const b = e.target.closest('[data-filtro]'); if (!b) return;
      st.filtro = b.dataset.filtro;
      $$('[data-filtro]', cont).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      pintarCuerpoOperaciones(modo);
    });
    cont.addEventListener('input', e => {
      if (e.target.type === 'search') { st.busqueda = e.target.value; pintarCuerpoOperaciones(modo); }
    });
    cont.addEventListener('change', e => {
      const i = e.target; if (!i.dataset || !i.dataset.uuid) return;
      const op = st.resultado.operaciones.find(o => o.uuid === i.dataset.uuid);
      const potencial = i.dataset.campo === 'deduccion' ? op.deduccionPotencial : op.iva;
      const v = i.value === '' ? null : Math.max(0, parseFloat(i.value) || 0);
      st.ajustes[op.uuid] = st.ajustes[op.uuid] || {};
      if (v == null || Math.abs(v - potencial) < 0.005) delete st.ajustes[op.uuid][i.dataset.campo];
      else st.ajustes[op.uuid][i.dataset.campo] = v;
      if (v == null) i.value = potencial.toFixed(2);
      recalcular(modo, false);
    });
  }

  // ====================== MODO DEMO ======================
  function bytesDeBase64(b64) {
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function iniciarDemo() {
    const D = window.R69_DEMO, st = estado.demo;
    const texto = R69.csv.decodificar(bytesDeBase64(D.csvBase64));
    st.listado = R69.csv.leerListado(texto);
    st.fechaDatos = st.listado.actualizadoAl || '30/09/2026';
    st.cfdis = D.cfdi.map(c => R69.cfdi.leerCFDI(c.xml, c.archivo)).filter(x => x.ok).map(x => x.cfdi);

    $('#demo-leeme').textContent = D.leeme.trim();
    $('#demo-prompt').textContent = PROMPT_INICIAL;

    const L = st.listado;
    const sucios = L.registros.filter(r => r.rfc !== r.rfcCrudo);
    $('#demo-csv-hechos').innerHTML = `
      <li><strong>${L.renglonEncabezado - 1} renglones de título</strong> antes del encabezado (renglón ${L.renglonEncabezado}); no son datos.</li>
      <li>Codificación <strong>Windows-1252</strong>: se decodifica con <code>TextDecoder('windows-1252')</code> para no romper acentos, comillas ni el guion largo del título.</li>
      <li><strong>${L.registros.length} contribuyentes</strong>: ${Object.entries(L.conteos).filter(([k, v]) => k !== 'Otra' || v).map(([k, v]) => `${h(k)} ${v}`).join(' · ')}.</li>
      <li>Fechas en formato dd/mm/aaaa, separadas por etapa (presunto, desvirtuado, definitivo y sentencia favorable) y por medio (página del SAT y DOF).</li>
      <li>${sucios.length ? `<strong>RFC que no viene limpio:</strong> ${sucios.map(s => `renglón ${s.renglon}: <code>[${h(s.rfcCrudo).replace(/ /g, '␠')}]</code> → <code>${h(s.rfc)}</code>`).join('; ')}.` : 'Todos los RFC vienen limpios.'}</li>
      <li>Leyenda del archivo: «Información actualizada al ${h(L.actualizadoAl)}».</li>`;

    // Vista previa: títulos, encabezado, primeros datos y renglones sucios
    const filas = R69.csv.parseCSV(texto);
    const iEnc = L.renglonEncabezado - 1;
    const mostrar = [];
    for (let i = 0; i <= iEnc + 3 && i < filas.length; i++) mostrar.push(i);
    sucios.forEach(s => { if (!mostrar.includes(s.renglon - 1)) mostrar.push(-1, s.renglon - 1); });
    const COLS = [0, 1, 2, 3, 13, 15];
    $('#demo-csv-vista').innerHTML = `<table><thead><tr><th>Renglón</th><th>No</th><th>RFC</th><th>Nombre</th><th>Situación</th><th>Def. SAT</th><th>Def. DOF</th></tr></thead><tbody>${mostrar.map(i => {
      if (i === -1) return `<tr><td colspan="7" class="secundario">…</td></tr>`;
      const f = filas[i];
      if (i < iEnc) return `<tr class="marca-titulo"><td>${i + 1}</td><td colspan="6">${h(f.filter(Boolean).join(' '))}</td></tr>`;
      const cls = i === iEnc ? 'marca-encabezado' : (sucios.some(s => s.renglon === i + 1) ? 'marca-sucio' : '');
      return `<tr class="${cls}"><td>${i + 1}</td>${COLS.map((c, j) => `<td${j === 1 ? ' class="mono"' : ''}>${j === 1 && i !== iEnc ? '[' + h(f[c] || '').replace(/ /g, '␠') + ']' : h(f[c] || '')}</td>`).join('')}</tr>`;
    }).join('')}</tbody></table>`;

    // Visor de CFDI
    const sel = $('#demo-cfdi-sel');
    sel.innerHTML = st.cfdis.map((c, i) => `<option value="${i}">${h(U.fechaMX(c.fecha))} · ${h(c.emisorNombre)} · ${h(c.uuid.slice(0, 8))}…</option>`).join('');
    const verCFDI = () => {
      const c = st.cfdis[+sel.value];
      const xml = D.cfdi.find(x => x.archivo === c.archivo).xml
        .replace(/(Sello|Certificado|SelloCFD|SelloSAT)="[^"]{40,}"/g, '$1="…"')
        .replace(/></g, '>\n<');
      const filasDatos = [['UUID', c.uuid], ['Emisor (RFC)', c.emisorRFC], ['Emisor (nombre)', c.emisorNombre], ['Receptor', c.receptorRFC + ' · ' + c.receptorNombre], ['Fecha', U.fechaMX(c.fecha)], ['Tipo', c.tipo + ' · ' + c.tipoTexto], ['Moneda', c.moneda], ['Subtotal', U.moneda(c.subtotal)], ['Descuento', U.moneda(c.descuento)], ['IVA trasladado (002)', U.moneda(c.ivaTrasladado)], ['Total', U.moneda(c.total)]];
      $('#demo-cfdi-datos').innerHTML = `<table><tbody>${filasDatos.map(([k, v]) => `<tr><th scope="row" style="background:var(--azul-50);color:var(--azul-800)">${h(k)}</th><td class="${/UUID|RFC/.test(k) ? 'mono' : ''}">${h(v)}</td></tr>`).join('')}</tbody></table>`;
      $('#demo-cfdi-xml').textContent = xml;
    };
    sel.addEventListener('change', verCFDI); verCFDI();

    renderParametrosISR('demo');
    enlazarTabla('demo');

    $('#demo-generar').addEventListener('click', () => $('#demo-ejecutar').click());
    $('#demo-ejecutar').addEventListener('click', () => {
      const t0 = performance.now();
      recalcular('demo', true);
      const r = st.resultado;
      $('#demo-estado').textContent = `Listo: ${r.operaciones.length} operaciones clasificadas en ${Math.max(1, Math.round(performance.now() - t0))} ms.`;
      $('#demo-ejecutar').innerHTML = `${ico('i-recargar')}Volver a ejecutar`;
    });
  }

  // ====================== MODO REAL ======================
  function fechaHora(iso) {
    if (!iso) return 'sin dato';
    const f = new Date(iso); if (isNaN(f)) return h(iso);
    return f.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
  }

  function pintarEstadoListado(mensajeError) {
    const st = estado.real, cont = $('#real-listado-estado');
    if (mensajeError) { cont.innerHTML = `<div class="aviso aviso--medio">${ico('i-alerta')}<div>${mensajeError}</div></div>`; return; }
    if (!st.listado) { cont.innerHTML = '<p class="secundario">Aún no se ha cargado un listado.</p>'; return; }
    const L = st.listado, F = st.fuente;
    const filas = [];
    if (F.tipo === 'servidor') {
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
    const adv = L.advertencias.length ? `<details class="detalle"><summary>${L.advertencias.length} advertencias del archivo (no bloquean)</summary><ul class="registro-carga">${L.advertencias.slice(0, 200).map(a => `<li>${h(a)}</li>`).join('')}</ul></details>` : '';
    const aviso = st.avisoListado ? `<div class="aviso aviso--medio" style="margin-top:12px">${ico('i-alerta')}<p>${st.avisoListado}</p></div>` : '';
    cont.innerHTML = `<div class="aviso aviso--bajo">${ico('i-ok')}<p>Listado cargado. Se usará para la revisión.</p></div><dl>${filas.map(([k, v]) => `<dt>${h(k)}</dt><dd>${v}</dd>`).join('')}</dl>${adv}${aviso}`;
  }

  function fijarListadoReal(listado, fuente, aviso) {
    const st = estado.real;
    st.listado = listado; st.fuente = fuente; st.avisoListado = aviso || '';
    const fLocal = (iso) => { const f = new Date(iso); return isNaN(f) ? '' : `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`; };
    const descarga = fuente.tipo === 'servidor' && fuente.meta.ultimaDescargaExitosa ? `descarga del ${fLocal(fuente.meta.ultimaDescargaExitosa)}` : (fuente.tipo === 'manual' ? `archivo ${fuente.nombre}` : '');
    st.fechaDatos = [listado.actualizadoAl || '', descarga].filter(Boolean).join(' · ');
    pintarEstadoListado();
    actualizarBotonReal();
  }

  async function cargarListadoServidor() {
    const b = $('#real-cargar-listado');
    b.disabled = true;
    $('#real-listado-estado').innerHTML = '<p class="cargando">Cargando la copia guardada del listado…</p>';
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
      fijarListadoReal(listado, { tipo: 'servidor', meta });
    } catch (e) {
      const m = e.message === 'archivo-local'
        ? '<p>La aplicación está abierta como archivo local, así que no puede leer la copia guardada del listado. Ábrela desde GitHub Pages o desde tu sitio web, o usa <strong>«Cargar CSV descargado del SAT»</strong>.</p>'
        : e.message === 'sin-copia'
          ? '<p>Todavía no hay un listado guardado en este sitio: la tarea automática lo descarga una vez al día. Mientras tanto, usa <strong>«Cargar CSV descargado del SAT»</strong>.</p>'
          : `<p>No se pudo cargar la copia guardada (${h(e.message)}). Puedes usar <strong>«Cargar CSV descargado del SAT»</strong>.</p>`;
      if (estado.real.listado) { pintarEstadoListado(); $('#real-listado-estado').insertAdjacentHTML('afterbegin', `<div class="aviso aviso--medio" style="margin-bottom:12px">${ico('i-alerta')}<div>${m}<p>Se conserva el listado que ya estaba cargado.</p></div></div>`); }
      else pintarEstadoListado(m);
    } finally { b.disabled = false; }
  }

  async function cargarListadoManual(archivo) {
    if (!archivo) return;
    $('#real-listado-estado').innerHTML = '<p class="cargando">Leyendo el archivo…</p>';
    try {
      const listado = R69.csv.leerListado(R69.csv.decodificar(new Uint8Array(await archivo.arrayBuffer())));
      const v = R69.csv.validarListado(listado, { minimoRegistros: 1 });
      if (!v.ok) throw new Error(v.errores.join(' '));
      const aviso = listado.registros.length < 5000 ? `El archivo tiene solo ${listado.registros.length} registros. El listado completo del SAT tiene más de 10,000: verifica que sea el «Listado completo 69-B».` : '';
      fijarListadoReal(listado, { tipo: 'manual', nombre: archivo.name, fechaArchivo: archivo.lastModified }, aviso);
    } catch (e) {
      if (estado.real.listado) { pintarEstadoListado(); $('#real-listado-estado').insertAdjacentHTML('afterbegin', `<div class="aviso aviso--alto" style="margin-bottom:12px">${ico('i-alerta')}<p>No se usó «${h(archivo.name)}»: ${h(e.message)} Se conserva el listado anterior.</p></div>`); }
      else pintarEstadoListado(`<p>No se pudo usar «${h(archivo.name)}»: ${h(e.message)}</p>`);
    }
  }

  function textoXML(bytes) {
    let enc = 'utf-8';
    const cab = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
    const m = /encoding=["']([\w.\-]+)["']/i.exec(cab);
    if (m) enc = m[1];
    try { return new TextDecoder(enc).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
  }

  function agregarXML(bytes, nombre) {
    const st = estado.real;
    const r = R69.cfdi.leerCFDI(textoXML(bytes), nombre);
    if (!r.ok) { st.registro.errores.push({ archivo: nombre, motivo: r.motivo }); return; }
    const c = r.cfdi;
    if (c.tipo !== 'I') { st.registro.omitidos.push({ archivo: nombre, motivo: `Tipo ${c.tipo} (${c.tipoTexto}): solo se analizan comprobantes de Ingreso.` }); return; }
    if (st.porUUID.has(c.uuid)) { st.registro.omitidos.push({ archivo: nombre, motivo: `Duplicado: el UUID ${c.uuid} ya se cargó desde «${st.porUUID.get(c.uuid).archivo}».` }); return; }
    st.porUUID.set(c.uuid, c); st.cfdis.push(c);
  }

  async function procesarArchivos(lista) {
    const st = estado.real, archivos = Array.from(lista || []);
    if (!archivos.length) return;
    $('#real-cfdi-resumen').innerHTML = `<p class="cargando">Procesando ${archivos.length} archivo(s)…</p>`;
    const antes = st.cfdis.length;
    for (const a of archivos) {
      const nombre = a.name, bytes = new Uint8Array(await a.arrayBuffer());
      try {
        if (/\.zip$/i.test(nombre)) {
          const z = await R69.zip.extraerXML(bytes, nombre);
          z.omitidos.forEach(o => st.registro.omitidos.push({ archivo: nombre + ' › ' + o.nombre, motivo: o.motivo }));
          z.archivos.forEach(x => agregarXML(x.bytes, nombre + ' › ' + x.nombre));
        } else if (/\.xml$/i.test(nombre)) agregarXML(bytes, nombre);
        else st.registro.omitidos.push({ archivo: nombre, motivo: 'No es un archivo XML ni ZIP.' });
      } catch (e) { st.registro.errores.push({ archivo: nombre, motivo: e.message }); }
    }
    st.ultimaCarga = st.cfdis.length - antes;
    pintarResumenCFDI();
    actualizarBotonReal();
  }

  function pintarResumenCFDI() {
    const st = estado.real, reg = st.registro, cont = $('#real-cfdi-resumen');
    if (!st.cfdis.length && !reg.omitidos.length && !reg.errores.length) { cont.innerHTML = ''; return; }
    const receptores = [...new Set(st.cfdis.map(c => c.receptorRFC))];
    const lista = (titulo, items) => items.length ? `<details class="detalle"><summary>${h(titulo)} (${items.length})</summary><ul class="registro-carga">${items.slice(0, 500).map(x => `<li><span class="mono">${h(x.archivo)}</span>: ${h(x.motivo)}</li>`).join('')}</ul></details>` : '';
    cont.innerHTML = `
      <ul class="carga-resumen">
        <li><span class="etiqueta-sit nivel-bajo">${st.cfdis.length} CFDI válidos</span></li>
        <li><span class="etiqueta-sit nivel-medio">${reg.omitidos.length} omitidos</span></li>
        <li><span class="etiqueta-sit nivel-alto">${reg.errores.length} con error</span></li>
      </ul>
      ${st.ultimaCarga != null ? `<p class="pequeno secundario">Última carga: ${st.ultimaCarga} comprobante(s) nuevo(s).</p>` : ''}
      ${receptores.length > 1 ? `<div class="aviso aviso--medio">${ico('i-alerta')}<p>Los CFDI corresponden a ${receptores.length} receptores distintos (${receptores.map(h).join(', ')}). Verifica que sean del mismo cliente.</p></div>` : receptores.length ? `<p class="pequeno">Receptor: <span class="mono">${h(receptores[0])}</span></p>` : ''}
      ${reg.omitidos.some(o => /^Tipo E\b/.test(o.motivo)) ? `<div class="aviso aviso--medio">${ico('i-alerta')}<p>Se omitieron CFDI de Egreso (notas de crédito). Si alguno corresponde a un proveedor listado, el IVA y la deducción comprometidos pueden estar sobrestimados: ajústalos en la tabla por operación.</p></div>` : ''}
      ${lista('Comprobantes omitidos', reg.omitidos)}${lista('Archivos con error', reg.errores)}`;
  }

  function actualizarBotonReal() {
    const st = estado.real;
    $('#real-ejecutar').disabled = !(st.listado && st.cfdis.length);
    $('#real-estado').textContent = !st.listado ? 'Falta cargar el listado 69-B.' : !st.cfdis.length ? 'Falta cargar los CFDI.' : 'Listo para ejecutar.';
  }

  function iniciarReal() {
    const st = estado.real;
    $('#real-cargar-listado').addEventListener('click', cargarListadoServidor);
    $('#real-csv-manual').addEventListener('change', e => { cargarListadoManual(e.target.files[0]); e.target.value = ''; });

    const zona = $('#real-zona'), input = $('#real-cfdi-input');
    input.addEventListener('change', e => { procesarArchivos(e.target.files); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.add('arrastrando'); }));
    ['dragleave', 'drop'].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.remove('arrastrando'); }));
    zona.addEventListener('drop', e => procesarArchivos(e.dataTransfer.files));
    zona.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    zona.tabIndex = 0;

    const f = $('#real-fecha');
    f.value = st.fechaRevision;
    f.addEventListener('change', () => { if (f.value) { st.fechaRevision = f.value; if (st.resultado) recalcular('real', true); } });

    $('#real-limpiar').addEventListener('click', () => {
      st.cfdis = []; st.porUUID = new Map(); st.registro = { omitidos: [], errores: [] }; st.ajustes = {}; st.ultimaCarga = null; st.resultado = null;
      $('#real-resultados').hidden = true; pintarResumenCFDI(); actualizarBotonReal();
    });
    $('#real-ejecutar').addEventListener('click', () => {
      recalcular('real', true);
      $('#real-resultados').hidden = false;
      $('#real-resultados').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    renderParametrosISR('real');
    enlazarTabla('real');
    actualizarBotonReal();
  }

  // Al imprimir, abrir los detalles para que aparezcan en el PDF
  window.addEventListener('beforeprint', () => { $$('details').forEach(d => { d.dataset.abierto = d.open ? '1' : ''; d.open = true; }); });
  window.addEventListener('afterprint', () => { $$('details').forEach(d => { d.open = d.dataset.abierto === '1'; }); });

  iniciarTamano();
  iniciarModos();
  iniciarPasos();
  iniciarDemo();
  iniciarReal();
})();
