/* Mi Registro de Salud — sin backend.
   Los datos viven en archivos CSV: en un repositorio de GitHub (vía API) o en el navegador. */

const ESQUEMAS = {
  presion: {
    archivo: 'presion.csv',
    columnas: ['id', 'fecha', 'hora', 'sistolica', 'diastolica', 'pulso', 'brazo', 'posicion', 'notas'],
    titulos: ['ID', 'Fecha', 'Hora', 'Sistólica', 'Diastólica', 'Pulso', 'Brazo', 'Posición', 'Notas'],
    nombre: 'Presión arterial',
  },
  glucosa: {
    archivo: 'glucosa.csv',
    columnas: ['id', 'fecha', 'hora', 'glucosa', 'momento', 'notas'],
    titulos: ['ID', 'Fecha', 'Hora', 'Glucosa (mg/dL)', 'Momento', 'Notas'],
    nombre: 'Glucosa',
  },
};

const COLORES = { serie1: '#2a78d6', serie2: '#eb6834', serie3: '#1baf7a', guia: '#9b9a95' };

/* ---------- Utilidades ---------- */

const pad = n => String(n).padStart(2, '0');
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const horaActual = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const sumarDias = (iso, dias) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + dias); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fechaMx = iso => iso ? iso.split('-').reverse().join('/') : '';
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ordenar = filas => filas.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

function avisar(texto, tipo = 'ok') {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.className = `aviso ${tipo}`;
  el.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { el.hidden = true; }, 3500);
}

/* ---------- CSV ---------- */

function parsearCSV(texto) {
  const filas = [];
  let fila = [], campo = '', comillas = false;
  texto = texto.replace(/^﻿/, '');
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const [encabezado, ...datos] = filas.filter(f => f.some(v => v.trim() !== ''));
  if (!encabezado) return [];
  return datos.map(f => Object.fromEntries(encabezado.map((h, i) => [h.trim(), f[i] ?? ''])));
}

function generarCSV(filas, columnas, titulos = columnas) {
  const celda = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [titulos.map(celda).join(','), ...filas.map(f => columnas.map(c => celda(f[c])).join(','))].join('\n') + '\n';
}

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Almacenamiento (GitHub o navegador) ---------- */

const Ajustes = {
  leer() { try { return JSON.parse(localStorage.getItem('rs_ajustes')) || {}; } catch { return {}; } },
  guardar(a) { localStorage.setItem('rs_ajustes', JSON.stringify(a)); },
  usaGitHub() { const a = this.leer(); return a.modo === 'github' && a.owner && a.repo && a.token; },
};

const b64aTexto = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
function textoAb64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const GitHub = {
  url(tipo) {
    const a = Ajustes.leer();
    const carpeta = (a.carpeta || 'data').replace(/^\/+|\/+$/g, '');
    const ruta = (carpeta ? carpeta + '/' : '') + ESQUEMAS[tipo].archivo;
    return `https://api.github.com/repos/${encodeURIComponent(a.owner)}/${encodeURIComponent(a.repo)}/contents/${ruta}`;
  },
  encabezados(extra = {}) {
    return { Authorization: `Bearer ${Ajustes.leer().token}`, Accept: 'application/vnd.github+json', ...extra };
  },
  async leer(tipo) {
    const rama = Ajustes.leer().rama || 'main';
    const r = await fetch(`${this.url(tipo)}?ref=${encodeURIComponent(rama)}`, { headers: this.encabezados(), cache: 'no-store' });
    if (r.status === 404) return { texto: '', sha: null };
    if (!r.ok) throw new Error(`GitHub respondió ${r.status} al leer ${ESQUEMAS[tipo].archivo}`);
    const j = await r.json();
    if (j.content) return { texto: b64aTexto(j.content), sha: j.sha };
    // Archivos de más de 1 MB: la API no incluye el contenido, se pide en crudo.
    const raw = await fetch(`${this.url(tipo)}?ref=${encodeURIComponent(rama)}`,
      { headers: this.encabezados({ Accept: 'application/vnd.github.raw' }), cache: 'no-store' });
    return { texto: await raw.text(), sha: j.sha };
  },
  async escribir(tipo, texto, sha, mensaje) {
    const cuerpo = { message: mensaje, content: textoAb64(texto), branch: Ajustes.leer().rama || 'main' };
    if (sha) cuerpo.sha = sha;
    const r = await fetch(this.url(tipo), { method: 'PUT', headers: this.encabezados(), body: JSON.stringify(cuerpo) });
    if (r.status === 409 || r.status === 422) { const e = new Error('conflicto'); e.conflicto = true; throw e; }
    if (!r.ok) throw new Error(`GitHub respondió ${r.status} al guardar`);
  },
};

const Datos = {
  cache: {},
  async leer(tipo) {
    if (Ajustes.usaGitHub()) {
      const { texto, sha } = await GitHub.leer(tipo);
      return { filas: ordenar(parsearCSV(texto)), sha };
    }
    return { filas: ordenar(parsearCSV(localStorage.getItem('rs_csv_' + tipo) || '')), sha: null };
  },
  async todas(tipo) {
    const { filas } = await this.leer(tipo);
    this.cache[tipo] = filas;
    return filas;
  },
  /* Lee la versión más reciente, aplica el cambio y escribe. Reintenta si otro dispositivo escribió antes. */
  async modificar(tipo, cambio, mensaje) {
    const cols = ESQUEMAS[tipo].columnas;
    for (let intento = 0; intento < 3; intento++) {
      const { filas, sha } = await this.leer(tipo);
      const nuevas = ordenar(cambio(filas));
      const texto = generarCSV(nuevas, cols);
      try {
        if (Ajustes.usaGitHub()) await GitHub.escribir(tipo, texto, sha, mensaje);
        else localStorage.setItem('rs_csv_' + tipo, texto);
        this.cache[tipo] = nuevas;
        return nuevas;
      } catch (e) {
        if (!e.conflicto) throw e;
      }
    }
    throw new Error('No se pudo guardar por cambios simultáneos. Intenta de nuevo.');
  },
};

function mostrarEstado() {
  const el = document.getElementById('estado-almacen');
  if (!el) return;
  const a = Ajustes.leer();
  el.textContent = Ajustes.usaGitHub() ? `☁️ GitHub: ${a.owner}/${a.repo}` : '📱 Solo este dispositivo';
}

/* ---------- Clasificación (referencia general, no diagnóstico) ---------- */

function clasificarPresion(s, d) {
  s = +s; d = +d;
  if (s > 180 || d > 120) return ['Crisis hipertensiva', 'critico'];
  if (s >= 140 || d >= 90) return ['Hipertensión etapa 2', 'serio'];
  if (s >= 130 || d >= 80) return ['Hipertensión etapa 1', 'alerta'];
  if (s >= 120) return ['Elevada', 'alerta'];
  if (s < 90 || d < 60) return ['Baja', 'alerta'];
  return ['Normal', 'bien'];
}

function clasificarGlucosa(v, momento) {
  v = +v;
  if (v < 70) return ['Baja', 'critico'];
  if (momento === 'En ayunas' || momento === 'Antes de comer') {
    if (v < 100) return ['Normal', 'bien'];
    if (v < 126) return ['Elevada', 'alerta'];
    return ['Alta', 'serio'];
  }
  if (v < 140) return ['Normal', 'bien'];
  if (v < 200) return ['Elevada', 'alerta'];
  return ['Alta', 'serio'];
}

const clasificar = (tipo, f) => tipo === 'presion' ? clasificarPresion(f.sistolica, f.diastolica) : clasificarGlucosa(f.glucosa, f.momento);
const etiqueta = ([texto, nivel]) => `<span class="etiqueta ${nivel}">${esc(texto)}</span>`;
const valorPrincipal = (tipo, f) => tipo === 'presion'
  ? `${esc(f.sistolica)}/${esc(f.diastolica)} <small>mmHg</small>${f.pulso ? ` · ${esc(f.pulso)} <small>lpm</small>` : ''}`
  : `${esc(f.glucosa)} <small>mg/dL</small> · ${esc(f.momento)}`;

/* ---------- Vistas de captura (presión y glucosa) ---------- */

function vistaCaptura(raiz, tipo) {
  const form = raiz.querySelector('form');
  const lista = raiz.querySelector('[data-lista-hoy]');
  const cancelar = raiz.querySelector('[data-cancelar]');
  const boton = form.querySelector('[type=submit]');

  const limpiar = () => {
    form.reset();
    form.elements.id.value = '';
    form.fecha.value = hoy();
    form.hora.value = horaActual();
    cancelar.hidden = true;
    boton.textContent = 'Guardar registro';
  };

  const pintar = filas => {
    const deHoy = filas.filter(f => f.fecha === hoy()).reverse();
    lista.innerHTML = deHoy.length ? deHoy.map(f => `
      <div class="registro">
        <div><strong>${esc(f.hora)}</strong> — ${valorPrincipal(tipo, f)} ${etiqueta(clasificar(tipo, f))}
          ${f.notas ? `<div class="ayuda">${esc(f.notas)}</div>` : ''}</div>
        <div class="botones">
          <button type="button" class="secundario" data-editar="${esc(f.id)}">Editar</button>
          <button type="button" class="peligro" data-eliminar="${esc(f.id)}">Eliminar</button>
        </div>
      </div>`).join('') : '<p class="ayuda">Aún no hay registros hoy.</p>';
  };

  const cargar = async () => {
    lista.innerHTML = '<p class="ayuda">Cargando…</p>';
    try { pintar(await Datos.todas(tipo)); }
    catch (e) { lista.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  };

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const datos = Object.fromEntries(new FormData(form));
    datos.fecha = hoy();
    const editando = !!datos.id;
    if (!editando) datos.id = nuevoId();
    boton.disabled = true;
    try {
      const filas = await Datos.modificar(tipo, filas => {
        if (!editando) return [...filas, datos];
        const actual = filas.find(f => f.id === datos.id);
        if (!actual || actual.fecha !== hoy()) throw new Error('Solo se pueden editar registros de hoy.');
        return filas.map(f => f.id === datos.id ? datos : f);
      }, `${editando ? 'Actualiza' : 'Agrega'} ${tipo} ${datos.fecha} ${datos.hora}`);
      avisar(editando ? 'Registro actualizado ✅' : 'Registro guardado ✅');
      limpiar();
      pintar(filas);
    } catch (e) { avisar(e.message, 'error'); }
    finally { boton.disabled = false; }
  });

  cancelar.addEventListener('click', limpiar);

  lista.addEventListener('click', async ev => {
    const idEditar = ev.target.dataset.editar, idEliminar = ev.target.dataset.eliminar;
    if (idEditar) {
      const f = (Datos.cache[tipo] || []).find(x => x.id === idEditar);
      if (!f) return;
      ESQUEMAS[tipo].columnas.forEach(c => { if (form.elements[c]) form.elements[c].value = f[c] ?? ''; });
      cancelar.hidden = false;
      boton.textContent = 'Actualizar registro';
      form.scrollIntoView({ behavior: 'smooth' });
    }
    if (idEliminar && confirm('¿Eliminar este registro?')) {
      try {
        const filas = await Datos.modificar(tipo, filas => {
          const f = filas.find(x => x.id === idEliminar);
          if (f && f.fecha !== hoy()) throw new Error('Solo se pueden eliminar registros de hoy.');
          return filas.filter(x => x.id !== idEliminar);
        }, `Elimina ${tipo} ${idEliminar}`);
        avisar('Registro eliminado');
        pintar(filas);
      } catch (e) { avisar(e.message, 'error'); }
    }
  });

  limpiar();
  cargar();
}

/* ---------- Vista de reportes ---------- */

const graficas = {};

function vistaReportes(raiz) {
  const filtros = raiz.querySelector('[data-filtros]');
  const tabla = raiz.querySelector('[data-tabla]');
  const resumen = raiz.querySelector('[data-resumen]');
  const contPulso = raiz.querySelector('[data-contenedor-pulso]');
  let visibles = [];

  filtros.desde.value = sumarDias(hoy(), -29);
  filtros.hasta.value = hoy();

  const filtrar = filas => filas.filter(f =>
    (!filtros.desde.value || f.fecha >= filtros.desde.value) && (!filtros.hasta.value || f.fecha <= filtros.hasta.value));

  const estadistica = (filas, campo) => {
    const v = filas.map(f => +f[campo]).filter(n => n > 0);
    if (!v.length) return null;
    return { prom: Math.round(v.reduce((a, b) => a + b, 0) / v.length), min: Math.min(...v), max: Math.max(...v) };
  };

  const textoResumen = (tipo, filas) => {
    if (!filas.length) return [];
    if (tipo === 'presion') {
      const s = estadistica(filas, 'sistolica'), d = estadistica(filas, 'diastolica'), p = estadistica(filas, 'pulso');
      return [
        ['Registros', filas.length],
        ['Promedio', `${s.prom}/${d.prom} mmHg`],
        ['Más alta', `${s.max}/${d.max} mmHg`],
        ['Más baja', `${s.min}/${d.min} mmHg`],
        ...(p ? [['Pulso promedio', `${p.prom} lpm`]] : []),
      ];
    }
    const g = estadistica(filas, 'glucosa');
    const ayunas = estadistica(filas.filter(f => f.momento === 'En ayunas'), 'glucosa');
    return [
      ['Registros', filas.length],
      ['Promedio', `${g.prom} mg/dL`],
      ['Más alta', `${g.max} mg/dL`],
      ['Más baja', `${g.min} mg/dL`],
      ...(ayunas ? [['Promedio en ayunas', `${ayunas.prom} mg/dL`]] : []),
    ];
  };

  const dibujar = (clave, canvas, etiquetas, series, titulo, guias = []) => {
    graficas[clave]?.destroy();
    const linea = (s, color) => ({ ...s, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: 0.2 });
    const colores = [COLORES.serie1, COLORES.serie2, COLORES.serie3];
    graficas[clave] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: etiquetas,
        datasets: [
          ...series.map((s, i) => linea(s, colores[i])),
          ...guias.map(g => ({ guia: true, label: g.label, data: etiquetas.map(() => g.valor), borderColor: COLORES.guia, borderDash: [4, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0 })),
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          title: { display: true, text: titulo, color: '#0b0b0b', font: { size: 14 } },
          legend: { display: series.length > 1 || guias.length > 0, labels: { color: '#52514e', usePointStyle: true, filter: i => i.text } },
          tooltip: { filter: i => !i.dataset.guia },
        },
        scales: {
          x: { ticks: { color: '#52514e', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
          y: { ticks: { color: '#52514e' }, grid: { color: '#ecebe8' } },
        },
      },
    });
  };

  const actualizar = async () => {
    const tipo = filtros.tipo.value;
    const esq = ESQUEMAS[tipo];
    try {
      visibles = filtrar(await Datos.todas(tipo));
    } catch (e) { avisar(e.message, 'error'); return; }

    resumen.innerHTML = visibles.length
      ? textoResumen(tipo, visibles).map(([k, v]) => `<div class="dato"><span>${k}</span><strong>${v}</strong></div>`).join('')
      : '<p class="ayuda">No hay registros en el periodo seleccionado.</p>';

    const etiquetas = visibles.map(f => `${fechaMx(f.fecha).slice(0, 5)} ${f.hora}`);
    if (tipo === 'presion') {
      dibujar('principal', raiz.querySelector('[data-grafica=principal]'), etiquetas, [
        { label: 'Sistólica', data: visibles.map(f => +f.sistolica) },
        { label: 'Diastólica', data: visibles.map(f => +f.diastolica) },
      ], 'Presión arterial (mmHg)', [{ label: 'Referencia 130/80', valor: 130 }, { label: '', valor: 80 }]);
      contPulso.hidden = false;
      dibujar('pulso', raiz.querySelector('[data-grafica=pulso]'), etiquetas,
        [{ label: 'Pulso', data: visibles.map(f => f.pulso ? +f.pulso : null) }], 'Pulso (latidos por minuto)');
    } else {
      dibujar('principal', raiz.querySelector('[data-grafica=principal]'), etiquetas,
        [{ label: 'Glucosa', data: visibles.map(f => +f.glucosa) }], 'Glucosa (mg/dL)',
        [{ label: 'Mínimo 70', valor: 70 }, { label: 'Ayunas 100', valor: 100 }, { label: 'Después de comer 140', valor: 140 }]);
      graficas.pulso?.destroy();
      contPulso.hidden = true;
    }

    const cols = esq.columnas.slice(1);
    tabla.innerHTML = `<thead><tr>${esq.titulos.slice(1).map(t => `<th>${t}</th>`).join('')}<th>Clasificación</th></tr></thead>
      <tbody>${[...visibles].reverse().map(f => `<tr>${cols.map(c => `<td>${esc(c === 'fecha' ? fechaMx(f[c]) : f[c])}</td>`).join('')}<td>${etiqueta(clasificar(tipo, f))}</td></tr>`).join('')}</tbody>`;
  };

  const nombreArchivo = ext => `${filtros.tipo.value}_${filtros.desde.value || 'inicio'}_a_${filtros.hasta.value || hoy()}.${ext}`;

  const descargarCSV = () => {
    const esq = ESQUEMAS[filtros.tipo.value];
    const cols = esq.columnas.slice(1);
    // BOM para que Excel muestre bien los acentos
    descargar(nombreArchivo('csv'), '﻿' + generarCSV(visibles, cols, esq.titulos.slice(1)), 'text/csv;charset=utf-8');
  };

  const descargarPDF = () => {
    if (!window.jspdf) { avisar('No se pudo cargar el generador de PDF. Revisa tu conexión.', 'error'); return; }
    const tipo = filtros.tipo.value, esq = ESQUEMAS[tipo];
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    const ancho = doc.internal.pageSize.getWidth(), m = 40;
    let y = m;

    doc.setFontSize(18).text(`Reporte de ${esq.nombre}`, m, y); y += 20;
    doc.setFontSize(10).setTextColor(90);
    const paciente = Ajustes.leer().paciente;
    if (paciente) { doc.text(`Paciente: ${paciente}`, m, y); y += 14; }
    doc.text(`Periodo: ${fechaMx(filtros.desde.value) || 'inicio'} al ${fechaMx(filtros.hasta.value) || fechaMx(hoy())}`, m, y); y += 14;
    doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, m, y); y += 20;

    doc.setTextColor(20).setFontSize(11);
    textoResumen(tipo, visibles).forEach(([k, v]) => { doc.text(`${k}: ${v}`, m, y); y += 15; });
    y += 8;

    ['principal', 'pulso'].forEach(clave => {
      const g = graficas[clave];
      if (!g || (clave === 'pulso' && tipo !== 'presion') || !visibles.length) return;
      const img = g.toBase64Image('image/png', 1);
      const w = ancho - m * 2, h = w * (g.height / g.width);
      if (y + h > doc.internal.pageSize.getHeight() - m) { doc.addPage(); y = m; }
      doc.addImage(img, 'PNG', m, y, w, h); y += h + 12;
    });

    doc.autoTable({
      startY: y,
      head: [[...esq.titulos.slice(1), 'Clasificación']],
      body: visibles.map(f => [...esq.columnas.slice(1).map(c => c === 'fecha' ? fechaMx(f[c]) : f[c]), clasificar(tipo, f)[0]]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [42, 120, 214] },
      margin: { left: m, right: m },
    });

    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i).setFontSize(8).setTextColor(120)
        .text(`Página ${i} de ${total} · Este reporte no sustituye la valoración médica.`, m, doc.internal.pageSize.getHeight() - 20);
    }
    doc.save(nombreArchivo('pdf'));
  };

  filtros.addEventListener('change', actualizar);
  raiz.querySelector('.rapidos').addEventListener('click', ev => {
    const dias = ev.target.dataset.dias;
    if (dias === undefined) return;
    filtros.desde.value = +dias ? sumarDias(hoy(), 1 - dias) : '';
    filtros.hasta.value = +dias ? hoy() : '';
    actualizar();
  });
  raiz.querySelector('[data-descargar=csv]').addEventListener('click', descargarCSV);
  raiz.querySelector('[data-descargar=pdf]').addEventListener('click', descargarPDF);

  // Chart.js se carga con "defer"; esperamos a que esté disponible.
  const iniciar = () => window.Chart ? actualizar() : setTimeout(iniciar, 100);
  iniciar();
}

/* ---------- Vista de ajustes ---------- */

function vistaAjustes(raiz) {
  const form = raiz.querySelector('[data-ajustes]');
  const camposGH = raiz.querySelector('[data-campos-github]');
  const a = Ajustes.leer();

  ['paciente', 'owner', 'repo', 'rama', 'carpeta', 'token'].forEach(k => { form[k].value = a[k] || ''; });
  form.modo.value = a.modo || 'local';
  const alternar = () => { camposGH.hidden = form.modo.value !== 'github'; };
  alternar();
  form.addEventListener('change', alternar);

  const leerForm = () => {
    const d = Object.fromEntries(new FormData(form));
    Object.keys(d).forEach(k => { d[k] = d[k].trim(); });
    return d;
  };

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    Ajustes.guardar(leerForm());
    Datos.cache = {};
    mostrarEstado();
    avisar('Ajustes guardados ✅');
  });

  raiz.querySelector('[data-probar]').addEventListener('click', async () => {
    const anterior = Ajustes.leer();
    Ajustes.guardar({ ...leerForm(), modo: 'github' });
    try {
      const a = Ajustes.leer();
      const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(a.owner)}/${encodeURIComponent(a.repo)}`, { headers: GitHub.encabezados() });
      if (!r.ok) throw new Error(r.status === 404 ? 'No se encontró el repositorio (o el token no tiene acceso).' : `Error ${r.status}`);
      const j = await r.json();
      avisar(`Conexión correcta con ${j.full_name}${j.private ? ' (privado) ✅' : ' — ⚠️ el repositorio es PÚBLICO'}`, j.private ? 'ok' : 'error');
    } catch (e) { avisar(e.message, 'error'); }
    finally { Ajustes.guardar(anterior); }
  });

  raiz.querySelectorAll('[data-respaldo]').forEach(b => b.addEventListener('click', async () => {
    const tipo = b.dataset.respaldo;
    try { descargar(ESQUEMAS[tipo].archivo, generarCSV(await Datos.todas(tipo), ESQUEMAS[tipo].columnas), 'text/csv;charset=utf-8'); }
    catch (e) { avisar(e.message, 'error'); }
  }));

  raiz.querySelector('[data-importar]').addEventListener('change', async ev => {
    const archivo = ev.target.files[0];
    if (!archivo) return;
    const tipo = raiz.querySelector('[data-importar-tipo]').value;
    const filas = parsearCSV(await archivo.text());
    const faltan = ESQUEMAS[tipo].columnas.filter(c => c !== 'id' && c !== 'notas' && !(filas[0] && c in filas[0]));
    if (!filas.length || faltan.length) { avisar(`El archivo no tiene las columnas esperadas: ${faltan.join(', ')}`, 'error'); return; }
    if (!confirm(`Se reemplazarán los datos de ${ESQUEMAS[tipo].nombre} con ${filas.length} registros. ¿Continuar?`)) return;
    filas.forEach(f => { f.id ||= nuevoId(); });
    try { await Datos.modificar(tipo, () => filas, `Importa ${tipo}`); avisar('Datos importados ✅'); }
    catch (e) { avisar(e.message, 'error'); }
    ev.target.value = '';
  });
}

/* ---------- Integración con HTMX ---------- */

const VISTAS = {
  presion: r => vistaCaptura(r, 'presion'),
  glucosa: r => vistaCaptura(r, 'glucosa'),
  reportes: vistaReportes,
  ajustes: vistaAjustes,
};

document.body.addEventListener('htmx:afterSwap', ev => {
  if (ev.detail.target.id !== 'contenido') return;
  const vista = ev.detail.target.querySelector('[data-vista]');
  if (vista) VISTAS[vista.dataset.vista]?.(vista);
});

document.body.addEventListener('htmx:beforeRequest', ev => {
  const boton = ev.detail.elt;
  if (!boton.closest('.pestanas')) return;
  document.querySelectorAll('.pestanas button').forEach(b => {
    b.classList.toggle('activa', b === boton);
    b.setAttribute('aria-selected', b === boton);
  });
});

document.body.addEventListener('htmx:responseError', () => avisar('No se pudo cargar la sección.', 'error'));

mostrarEstado();
