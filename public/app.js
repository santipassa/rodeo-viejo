// RodeoViejo — lógica del cliente (con pestañas tipo Postman).
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// ---------------------------------------------------------------------------
// Editores clave/valor (headers y query params)
// ---------------------------------------------------------------------------
function makeKvEditor(container, { onChange } = {}) {
  function rows() { return [...container.querySelectorAll('.kv-row')]; }

  function addRow(key = '', value = '', enabled = true) {
    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="checkbox" ${enabled ? 'checked' : ''} class="kv-on" />
      <input type="text" class="kv-key" placeholder="clave" value="" />
      <input type="text" class="kv-val" placeholder="valor" value="" />
      <button class="del" title="Quitar">×</button>`;
    row.querySelector('.kv-key').value = key;
    row.querySelector('.kv-val').value = value;

    const maybeGrow = () => {
      const rs = rows();
      const last = rs[rs.length - 1];
      const k = last.querySelector('.kv-key').value;
      const v = last.querySelector('.kv-val').value;
      if (k || v) addRow();
      onChange?.();
    };
    row.querySelector('.kv-key').addEventListener('input', maybeGrow);
    row.querySelector('.kv-val').addEventListener('input', maybeGrow);
    row.querySelector('.kv-on').addEventListener('change', () => onChange?.());
    row.querySelector('.del').addEventListener('click', () => {
      row.remove();
      if (rows().length === 0) addRow();
      onChange?.();
    });
    container.appendChild(row);
    return row;
  }

  // Para enviar: solo filas habilitadas y con clave.
  function get() {
    const out = {};
    for (const r of rows()) {
      const on = r.querySelector('.kv-on').checked;
      const k = r.querySelector('.kv-key').value.trim();
      const v = r.querySelector('.kv-val').value;
      if (on && k) out[k] = v;
    }
    return out;
  }

  // Para guardar el estado de la pestaña: todas las filas tal cual están.
  function getRows() {
    return rows().map((r) => ({
      key: r.querySelector('.kv-key').value,
      value: r.querySelector('.kv-val').value,
      enabled: r.querySelector('.kv-on').checked,
    })).filter((r) => r.key || r.value);
  }
  function setRows(list) {
    container.innerHTML = '';
    for (const it of (list || [])) addRow(it.key, it.value, it.enabled !== false);
    addRow(); // fila vacía al final
  }
  function set(obj) {
    container.innerHTML = '';
    for (const [k, v] of Object.entries(obj || {})) addRow(k, v, true);
    addRow();
  }

  addRow();
  return { get, getRows, setRows, set };
}

// Editor de form-data: cada fila puede ser texto o archivo (como en Postman).
function makeFormDataEditor(container, { onChange } = {}) {
  function rows() { return [...container.querySelectorAll('.kv-row')]; }

  function addRow(item = {}) {
    const row = document.createElement('div');
    row.className = 'kv-row fd-row';
    row.innerHTML = `
      <input type="checkbox" class="kv-on" />
      <input type="text" class="kv-key" placeholder="clave" />
      <select class="kv-type">
        <option value="text">Texto</option>
        <option value="file">Archivo</option>
      </select>
      <div class="fd-value">
        <input type="text" class="kv-val" placeholder="valor" />
        <div class="fd-file hidden">
          <input type="file" class="fd-input hidden" />
          <button class="ghost-btn fd-pick">Elegir…</button>
          <span class="fd-name"></span>
        </div>
      </div>
      <button class="del" title="Quitar">×</button>`;

    const key = row.querySelector('.kv-key');
    const val = row.querySelector('.kv-val');
    const type = row.querySelector('.kv-type');
    const on = row.querySelector('.kv-on');
    const fileBox = row.querySelector('.fd-file');
    const fileInput = row.querySelector('.fd-input');
    const fileName = row.querySelector('.fd-name');

    key.value = item.key || '';
    val.value = item.value || '';
    type.value = item.kind === 'file' ? 'file' : 'text';
    on.checked = item.enabled !== false;
    // El File vive solo en memoria: si viene del historial o de un curl, solo tenemos el nombre.
    row._file = item.file || null;
    row._fileName = item.fileName || '';

    function paintFile() {
      const isFile = type.value === 'file';
      fileBox.classList.toggle('hidden', !isFile);
      val.classList.toggle('hidden', isFile);
      fileName.textContent = row._fileName || 'sin archivo';
      fileName.classList.toggle('missing', !!row._fileName && !row._file);
      fileName.title = row._fileName && !row._file
        ? 'El archivo no está cargado: volvé a elegirlo antes de enviar'
        : row._fileName;
    }
    paintFile();

    const maybeGrow = () => {
      const rs = rows();
      const last = rs[rs.length - 1];
      if (last.querySelector('.kv-key').value || last.querySelector('.kv-val').value || last._fileName) addRow();
      onChange?.();
    };
    key.addEventListener('input', maybeGrow);
    val.addEventListener('input', maybeGrow);
    on.addEventListener('change', () => onChange?.());
    type.addEventListener('change', () => { paintFile(); onChange?.(); });
    row.querySelector('.fd-pick').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0] || null;
      row._file = f;
      row._fileName = f ? f.name : '';
      paintFile();
      maybeGrow();
    });
    row.querySelector('.del').addEventListener('click', () => {
      row.remove();
      if (rows().length === 0) addRow();
      onChange?.();
    });

    container.appendChild(row);
    return row;
  }

  function getRows() {
    return rows().map((r) => ({
      key: r.querySelector('.kv-key').value,
      kind: r.querySelector('.kv-type').value,
      value: r.querySelector('.kv-val').value,
      fileName: r._fileName || '',
      file: r._file || null,
      enabled: r.querySelector('.kv-on').checked,
    })).filter((r) => r.key || r.value || r.fileName);
  }

  function setRows(list) {
    container.innerHTML = '';
    for (const it of (list || [])) addRow(it);
    addRow();
  }

  addRow();
  return { getRows, setRows };
}

const headersEditor = makeKvEditor($('#headers-editor'), { onChange: onHeadersChange });
const paramsEditor = makeKvEditor($('#params-editor'), { onChange: syncParamsToUrl });
const varsEditor = makeKvEditor($('#vars-editor'));
const formDataEditor = makeFormDataEditor($('#formdata-editor'), { onChange: onBodyChange });
const urlencodedEditor = makeKvEditor($('#urlencoded-editor'), { onChange: onBodyChange });

function onHeadersChange() {
  updateHeadersCount();
  const t = getActiveTab();
  if (t) t.headers = headersEditor.getRows();
}
function updateHeadersCount() {
  const n = Object.keys(headersEditor.get()).length;
  $('#headers-count').textContent = n ? n : '';
}

// URLSearchParams escapa las llaves; se las devolvemos para no romper las {{variables}}.
function keepVarBraces(qs) { return qs.replace(/%7B%7B/gi, '{{').replace(/%7D%7D/gi, '}}'); }

// Sincronizar query params → URL
let suppressUrlSync = false;
function syncParamsToUrl() {
  if (suppressUrlSync) return;
  const base = $('#url').value.split('?')[0];
  const params = paramsEditor.get();
  const qs = keepVarBraces(new URLSearchParams(params).toString());
  $('#url').value = qs ? `${base}?${qs}` : base;
  const t = getActiveTab();
  if (t) { t.url = $('#url').value; renderTabBar(); }
}
function syncParamsFromUrl() {
  const [, query] = $('#url').value.split('?');
  const obj = {};
  if (query) for (const [k, v] of new URLSearchParams(query)) obj[k] = v;
  suppressUrlSync = true; paramsEditor.set(obj); suppressUrlSync = false;
}
$('#url').addEventListener('blur', syncParamsFromUrl);
$('#url').addEventListener('input', () => {
  const t = getActiveTab();
  if (t) { t.url = $('#url').value; renderTabBar(); }
});
$('#method').addEventListener('change', () => {
  const t = getActiveTab();
  if (t) { t.method = $('#method').value; renderTabBar(); }
});

// ---------------------------------------------------------------------------
// Sub-tabs de configuración y de respuesta (Params/Headers/Body ...)
// ---------------------------------------------------------------------------
function wireTabs(navSel) {
  const nav = $(navSel);
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const scope = nav.parentElement;
    nav.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
    scope.querySelectorAll('.tab-panel').forEach((p) =>
      p.classList.toggle('active', p.dataset.panel === btn.dataset.tab));
  });
}
wireTabs('#req-tabs');
wireTabs('#resp-tabs');

// ---------------------------------------------------------------------------
// Body: none / form-data / x-www-form-urlencoded / raw / binary / GraphQL
// ---------------------------------------------------------------------------
const BODY_MODES = ['none', 'form-data', 'urlencoded', 'raw', 'binary', 'graphql'];
let binaryState = { file: null, fileName: '', contentType: '' };

const RAW_CONTENT_TYPES = {
  json: 'application/json',
  text: 'text/plain',
  xml: 'application/xml',
  html: 'text/html',
  javascript: 'application/javascript',
};
const RAW_PLACEHOLDERS = {
  json: '{ "clave": "valor" }',
  text: 'texto plano',
  xml: '<root><item>valor</item></root>',
  html: '<!doctype html>…',
  javascript: 'console.log("hola")',
};

function emptyBody() {
  return {
    mode: 'none',
    raw: { text: '', lang: 'json' },
    urlencoded: [],
    formData: [],
    binary: { file: null, fileName: '', contentType: '' },
    graphql: { query: '', variables: '' },
  };
}

// Content-Type que agrega el server si no lo definiste vos en Headers.
// form-data va vacío a propósito: el boundary lo arma fetch.
function autoContentType(b) {
  switch (b.mode) {
    case 'raw': return b.raw.text ? `${RAW_CONTENT_TYPES[b.raw.lang] || 'text/plain'}; charset=utf-8` : '';
    case 'urlencoded': return 'application/x-www-form-urlencoded; charset=utf-8';
    case 'graphql': return 'application/json';
    case 'binary': return b.binary.contentType || b.binary.file?.type || 'application/octet-stream';
    default: return '';
  }
}

function bodyMode() { return $('#body-mode').value; }

// Vuelca el DOM al objeto de estado del body.
function readBodyState() {
  const b = emptyBody();
  b.mode = bodyMode();
  b.raw = { text: $('#body').value, lang: $('#raw-lang').value };
  b.urlencoded = urlencodedEditor.getRows();
  b.formData = formDataEditor.getRows();
  b.binary = { ...binaryState };
  b.graphql = { query: $('#gql-query').value, variables: $('#gql-vars').value };
  return b;
}

// Carga un objeto de estado del body al DOM.
function applyBodyState(b) {
  const s = { ...emptyBody(), ...(b || {}) };
  $('#body-mode').value = BODY_MODES.includes(s.mode) ? s.mode : 'none';
  $('#raw-lang').value = s.raw?.lang || 'json';
  $('#body').value = s.raw?.text || '';
  urlencodedEditor.setRows(s.urlencoded);
  formDataEditor.setRows(s.formData);
  binaryState = { file: null, fileName: '', contentType: '', ...(s.binary || {}) };
  // El input queda vacío para que volver a elegir el mismo archivo dispare el change.
  $('#binary-file').value = '';
  $('#gql-query').value = s.graphql?.query || '';
  $('#gql-vars').value = s.graphql?.variables || '';
  paintBody();
}

// Muestra el panel del modo activo y refresca los indicadores.
function paintBody() {
  const mode = bodyMode();
  $$('.body-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.body !== mode));
  $('#raw-lang').classList.toggle('hidden', mode !== 'raw');
  $('#format-json').classList.toggle('hidden', !(mode === 'raw' && $('#raw-lang').value === 'json') && mode !== 'graphql');
  $('#body').placeholder = RAW_PLACEHOLDERS[$('#raw-lang').value] || '';

  const ct = autoContentType(readBodyStateLite());
  $('#body-ct').textContent = ct ? `Content-Type: ${ct}` : '';

  $('#binary-name').textContent = binaryState.fileName || 'Ningún archivo seleccionado';
  $('#binary-name').classList.toggle('missing', !!binaryState.fileName && !binaryState.file);
  $('#binary-clear').classList.toggle('hidden', !binaryState.fileName);

  $('#body-dot').textContent = mode === 'none' ? '' : '•';
}

// Versión liviana (sin leer los editores) para calcular el Content-Type mostrado.
function readBodyStateLite() {
  return {
    mode: bodyMode(),
    raw: { text: $('#body').value, lang: $('#raw-lang').value },
    binary: binaryState,
  };
}

function onBodyChange() {
  const t = getActiveTab();
  if (t) t.body = readBodyState();
}

$('#body-mode').addEventListener('change', () => { paintBody(); onBodyChange(); });
$('#raw-lang').addEventListener('change', () => { paintBody(); onBodyChange(); });
$('#body').addEventListener('input', () => { paintBody(); onBodyChange(); });
$('#gql-query').addEventListener('input', onBodyChange);
$('#gql-vars').addEventListener('input', onBodyChange);

$('#binary-pick').addEventListener('click', () => $('#binary-file').click());
$('#binary-file').addEventListener('change', () => {
  const f = $('#binary-file').files?.[0] || null;
  binaryState = { file: f, fileName: f ? f.name : '', contentType: f?.type || '' };
  paintBody();
  onBodyChange();
});
$('#binary-clear').addEventListener('click', () => {
  binaryState = { file: null, fileName: '', contentType: '' };
  $('#binary-file').value = '';
  paintBody();
  onBodyChange();
});

$('#format-json').addEventListener('click', () => {
  const el = bodyMode() === 'graphql' ? $('#gql-vars') : $('#body');
  if (!el.value.trim()) return;
  try {
    el.value = JSON.stringify(JSON.parse(el.value), null, 2);
    onBodyChange();
    toast('JSON formateado ✨');
  } catch { toast('Eso no es JSON válido'); }
});

// Los archivos viajan al proxy en base64 dentro del JSON de la request.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error(`No pude leer el archivo "${file.name}"`));
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.readAsDataURL(file);
  });
}

// Estado del body → payload para el server (con {{variables}} ya resueltas).
async function bodyToWire(b) {
  switch (b.mode) {
    case 'raw':
      return { mode: 'raw', raw: { text: applyVars(b.raw.text), lang: b.raw.lang } };

    case 'urlencoded':
      return {
        mode: 'urlencoded',
        urlencoded: b.urlencoded
          .filter((r) => r.enabled !== false && r.key.trim())
          .map((r) => ({ key: applyVars(r.key), value: applyVars(r.value) })),
      };

    case 'graphql':
      return {
        mode: 'graphql',
        graphql: { query: applyVars(b.graphql.query), variables: applyVars(b.graphql.variables) },
      };

    case 'binary': {
      if (!b.binary.file) throw new Error('Elegí un archivo para el body binary');
      return {
        mode: 'binary',
        binary: {
          fileName: b.binary.fileName,
          contentType: b.binary.file.type || '',
          data: await fileToBase64(b.binary.file),
        },
      };
    }

    case 'form-data': {
      const out = [];
      for (const r of b.formData) {
        if (r.enabled === false || !r.key.trim()) continue;
        if (r.kind === 'file') {
          if (!r.file) throw new Error(`Falta cargar el archivo del campo "${r.key}"`);
          out.push({
            key: applyVars(r.key), kind: 'file', fileName: r.fileName,
            contentType: r.file.type || '', data: await fileToBase64(r.file),
          });
        } else {
          out.push({ key: applyVars(r.key), kind: 'text', value: applyVars(r.value) });
        }
      }
      return { mode: 'form-data', formData: out };
    }

    default:
      return { mode: 'none' };
  }
}

// Snapshot serializable (sin el contenido de los archivos) para guardar en el historial.
function bodyToMeta(b) {
  const m = { mode: b.mode };
  if (b.mode === 'raw') m.raw = { ...b.raw };
  if (b.mode === 'graphql') m.graphql = { ...b.graphql };
  if (b.mode === 'urlencoded') m.urlencoded = b.urlencoded.map(({ key, value, enabled }) => ({ key, value, enabled }));
  if (b.mode === 'form-data') {
    m.formData = b.formData.map(({ key, kind, value, fileName, enabled }) => ({ key, kind, value, fileName, enabled }));
  }
  if (b.mode === 'binary') m.binary = { fileName: b.binary.fileName, contentType: b.binary.contentType };
  return m;
}

// ===========================================================================
// GESTOR DE PESTAÑAS
// ===========================================================================
let tabs = [];
let activeTabId = null;
let tabSeq = 0;

function getActiveTab() { return tabs.find((t) => t.id === activeTabId) || null; }

// Vuelca el DOM al estado de la pestaña activa (antes de cambiar de pestaña).
function readActiveState() {
  const t = getActiveTab();
  if (!t) return;
  t.method = $('#method').value;
  t.url = $('#url').value;
  t.headers = headersEditor.getRows();
  t.body = readBodyState();
}

// Carga el estado de una pestaña al DOM.
function applyState(t) {
  $('#method').value = t.method;
  $('#url').value = t.url;
  headersEditor.setRows(t.headers);
  updateHeadersCount();
  syncParamsFromUrl();
  applyBodyState(t.body);
  if (t.response) renderResponse(t.response);
  else clearResponse();
}

function newTab(init = {}) {
  readActiveState();
  const t = {
    id: ++tabSeq,
    method: init.method || 'GET',
    url: init.url || '',
    headers: init.headers || [],
    body: init.body || emptyBody(),
    response: init.response || null,
    historyId: init.historyId || null,
  };
  tabs.push(t);
  activeTabId = t.id;
  applyState(t);
  renderTabBar();
  loadHistory();
  if (!init.url) $('#url').focus();
  return t;
}

function switchTab(id) {
  if (id === activeTabId) return;
  readActiveState();
  activeTabId = id;
  applyState(getActiveTab());
  renderTabBar();
  loadHistory();
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i === -1) return;
  const wasActive = id === activeTabId;
  tabs.splice(i, 1);
  if (wasActive) {
    if (tabs.length) {
      activeTabId = tabs[Math.max(0, i - 1)].id;
      applyState(getActiveTab());
    } else {
      activeTabId = null;
      newTab();
      return;
    }
  }
  renderTabBar();
  loadHistory();
}

function tabTitle(t) {
  if (!t.url.trim()) return 'Nueva request';
  try {
    const u = new URL(t.url);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    return seg || u.hostname;
  } catch {
    return t.url.replace(/^https?:\/\//, '').slice(0, 24) || 'Nueva request';
  }
}

function renderTabBar() {
  const bar = $('#tabbar');
  bar.innerHTML = '';
  for (const t of tabs) {
    const el = document.createElement('div');
    el.className = 'tabitem' + (t.id === activeTabId ? ' active' : '');
    el.innerHTML = `
      <span class="t-method m-${t.method}">${t.method}</span>
      <span class="t-title" title="${escapeAttr(t.url || 'Nueva request')}">${escapeHtml(tabTitle(t))}</span>
      <button class="t-close" title="Cerrar">×</button>`;
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('t-close')) { closeTab(t.id); return; }
      switchTab(t.id);
    });
    bar.appendChild(el);
  }
  const add = document.createElement('button');
  add.className = 'tab-new';
  add.textContent = '+';
  add.title = 'Nueva pestaña';
  add.addEventListener('click', () => newTab());
  bar.appendChild(add);
}

// ---------------------------------------------------------------------------
// Enviar request
// ---------------------------------------------------------------------------
$('#send').addEventListener('click', sendRequest);
$('#url').addEventListener('keydown', (e) => { if (e.key === 'Enter') trySend(); });

// Cmd/Ctrl+Enter envía desde cualquier parte de la app (body, headers, respuesta…).
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); trySend(); }
});

function trySend() {
  // Con un modal abierto el Enter es del modal, no de la request de atrás.
  if ($('.modal:not(.hidden)')) return;
  sendRequest();
}

$('#send').title = `Enviar (${/Mac/i.test(navigator.userAgent) ? '⌘' : 'Ctrl'} + Enter)`;

async function sendRequest() {
  if ($('#send').disabled) return; // ya hay una request en vuelo
  const url = $('#url').value.trim();
  if (!url) { toast('Ingresá una URL'); return; }
  readActiveState();

  const btn = $('#send');
  btn.disabled = true; btn.textContent = 'Enviando…';

  // Resolvemos las variables {{nombre}} en URL, headers (clave y valor) y body.
  const rawHeaders = headersEditor.get();
  const headers = {};
  for (const [k, v] of Object.entries(rawHeaders)) headers[applyVars(k)] = applyVars(v);

  const bodyState = readBodyState();
  let payload;
  try {
    payload = {
      method: $('#method').value,
      url: applyVars(url),
      headers,
      body: await bodyToWire(bodyState),
      bodyMeta: bodyToMeta(bodyState),
      // La request tal como la escribiste, con las {{variables}} sin resolver:
      // es lo que se recarga al reabrirla desde el historial.
      requestMeta: { url, headers: headersEditor.getRows() },
    };
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Enviar';
    toast(e.message);
    return;
  }

  try {
    const res = await fetch('/api/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const t = getActiveTab();
    if (t) { t.response = data; t.historyId = data.id ?? t.historyId; }
    renderResponse(data);
    await loadHistory();
  } catch (e) {
    renderResponse({ error: e.message });
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar';
  }
}

// ---------------------------------------------------------------------------
// Render de la respuesta
// ---------------------------------------------------------------------------
let currentResponseText = '';

function clearResponse() {
  const pill = $('#resp-status');
  pill.classList.add('hidden');
  $('#copy-resp').classList.add('hidden');
  $('#resp-time').textContent = '';
  $('#resp-size').textContent = '';
  $('#resp-body').innerHTML = '<span class="placeholder">La respuesta va a aparecer acá.</span>';
  $('#resp-headers').textContent = '';
  $('#resp-headers-count').textContent = '';
  currentResponseText = '';
  refreshFind();
}

function renderResponse(data) {
  const pill = $('#resp-status');
  pill.classList.remove('hidden', 'status-2', 'status-3', 'status-4', 'status-5', 'status-err');
  $('#copy-resp').classList.remove('hidden');

  if (data.error) {
    pill.textContent = 'ERROR';
    pill.classList.add('status-err');
    $('#resp-time').textContent = data.durationMs != null ? `${data.durationMs} ms` : '';
    $('#resp-size').textContent = '';
    $('#resp-body').textContent = data.error;
    $('#resp-headers').textContent = '';
    currentResponseText = data.error;
    refreshFind();
    return;
  }

  pill.textContent = `${data.status} ${data.statusText || ''}`.trim();
  pill.classList.add(`status-${String(data.status)[0]}`);
  $('#resp-time').textContent = `${data.durationMs} ms`;
  $('#resp-size').textContent = formatBytes(data.sizeBytes);

  renderBody($('#resp-body'), data.responseBody, data.responseHeaders);

  const headerLines = Object.entries(data.responseHeaders || {})
    .map(([k, v]) => `${k}: ${v}`).join('\n');
  $('#resp-headers').textContent = headerLines || '(sin headers)';
  $('#resp-headers-count').textContent = Object.keys(data.responseHeaders || {}).length || '';
  currentResponseText = data.responseBody || '';
  refreshFind();
}

$('#copy-resp').addEventListener('click', () => {
  navigator.clipboard.writeText(currentResponseText).then(() => toast('Copiado al portapapeles'));
});

function renderBody(el, body, headers) {
  if (body == null || body === '') { el.innerHTML = '<span class="placeholder">(respuesta vacía)</span>'; return; }
  const ct = (headers?.['content-type'] || '').toLowerCase();
  const looksJson = ct.includes('json') || /^[\s]*[[{]/.test(body);
  if (looksJson) {
    try {
      const pretty = JSON.stringify(JSON.parse(body), null, 2);
      el.innerHTML = highlightJson(pretty);
      return;
    } catch { /* texto plano */ }
  }
  el.textContent = body;
}

function highlightJson(json) {
  const esc = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'tok-num';
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'tok-key' : 'tok-str';
      else if (/true|false/.test(match)) cls = 'tok-bool';
      else if (/null/.test(match)) cls = 'tok-null';
      return `<span class="${cls}">${match}</span>`;
    });
}

// ---------------------------------------------------------------------------
// Buscar dentro de la respuesta (Cmd/Ctrl+F)
// ---------------------------------------------------------------------------
const findBar = $('#find-bar');
const findInput = $('#find-input');
const FIND_MAX = 5000;          // tope de coincidencias: bodies enormes no cuelgan la UI
const FIND_DEBOUNCE = 120;

// Chromium pinta los rangos sin tocar el DOM (así no rompemos el highlight del JSON).
const canHighlight = typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight === 'function';

let findRanges = [];
let findIndex = -1;
let findCase = false;
let findTimer;

function findOpen() { return !findBar.classList.contains('hidden'); }

// Se busca en el panel de respuesta que esté visible (Body o Headers).
function findTarget() { return $('#response-section .tab-panel.active .output'); }

// Texto plano del panel + de qué nodo salió cada posición, para poder armar los rangos.
function collectText(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.classList.contains('placeholder')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  let text = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n, start: text.length, end: text.length + n.nodeValue.length });
    text += n.nodeValue;
  }
  return { nodes, text };
}

function runFind() {
  clearHighlights();
  findRanges = [];
  findIndex = -1;

  const term = findInput.value;
  const el = findTarget();
  if (el && term) {
    const { nodes, text } = collectText(el);
    const hay = findCase ? text : text.toLowerCase();
    const needle = findCase ? term : term.toLowerCase();

    // Las coincidencias salen ordenadas, así que recorremos los nodos con un cursor.
    let ni = 0;
    const at = (pos) => {
      while (ni < nodes.length - 1 && pos >= nodes[ni].end) ni++;
      return { node: nodes[ni].node, offset: pos - nodes[ni].start };
    };

    let from = 0, i;
    while (nodes.length && (i = hay.indexOf(needle, from)) !== -1 && findRanges.length < FIND_MAX) {
      const a = at(i);
      const b = at(i + needle.length);
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      findRanges.push(range);
      from = i + needle.length;
    }
    if (findRanges.length) findIndex = 0;
  }

  paintFind();
  if (findIndex >= 0) scrollToMatch();
}

function paintFind() {
  const count = $('#find-count');
  if (!findInput.value) count.textContent = '';
  else if (!findRanges.length) count.textContent = 'sin resultados';
  else count.textContent = `${findIndex + 1}/${findRanges.length}${findRanges.length === FIND_MAX ? '+' : ''}`;
  count.classList.toggle('none', !!findInput.value && !findRanges.length);

  if (!canHighlight) {
    // Sin Custom Highlight API marcamos la coincidencia con la selección del sistema.
    const cur = findRanges[findIndex];
    if (cur) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(cur); }
    return;
  }
  if (!findRanges.length) { clearHighlights(); return; }
  CSS.highlights.set('rv-find', new Highlight(...findRanges));
  const cur = findRanges[findIndex];
  if (cur) {
    const h = new Highlight(cur);
    h.priority = 1; // gana sobre el resaltado del resto de las coincidencias
    CSS.highlights.set('rv-find-current', h);
  } else {
    CSS.highlights.delete('rv-find-current');
  }
}

function clearHighlights() {
  if (!canHighlight) return;
  CSS.highlights.delete('rv-find');
  CSS.highlights.delete('rv-find-current');
}

function scrollToMatch() {
  const range = findRanges[findIndex];
  const box = findTarget();
  if (!range || !box) return;
  const r = range.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.top < b.top + 8 || r.bottom > b.bottom - 8) {
    box.scrollTop += r.top - b.top - box.clientHeight / 3;
  }
}

function stepFind(delta) {
  if (!findRanges.length) return;
  findIndex = (findIndex + delta + findRanges.length) % findRanges.length;
  paintFind();
  scrollToMatch();
}

function openFind() {
  const el = findTarget();
  if (!el) return;
  findBar.classList.remove('hidden');
  // Si venías con algo seleccionado en la respuesta, arrancamos buscando eso.
  const sel = window.getSelection?.();
  const picked = String(sel || '').trim();
  if (picked && picked.length <= 120 && sel.anchorNode && el.contains(sel.anchorNode)) {
    findInput.value = picked;
  }
  findInput.focus();
  findInput.select();
  runFind();
}

function closeFind() {
  findBar.classList.add('hidden');
  clearHighlights();
  findRanges = [];
  findIndex = -1;
  findTarget()?.focus();
}

// Los rangos apuntan a nodos que ya no existen cuando se repinta la respuesta.
function refreshFind() {
  if (findOpen()) runFind();
  else clearHighlights();
}

findInput.addEventListener('input', () => {
  clearTimeout(findTimer);
  findTimer = setTimeout(runFind, FIND_DEBOUNCE);
});
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
$('#find-next').addEventListener('click', () => stepFind(1));
$('#find-prev').addEventListener('click', () => stepFind(-1));
$('#find-close').addEventListener('click', closeFind);
$('#find-case').addEventListener('click', () => {
  findCase = !findCase;
  $('#find-case').classList.toggle('on', findCase);
  runFind();
});
// Cambiar de pestaña (Body ↔ Headers) rehace la búsqueda sobre el panel nuevo.
$('#resp-tabs').addEventListener('click', () => { if (findOpen()) runFind(); });

window.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'f') {
    if ($('.modal:not(.hidden)')) return; // hay un modal abierto: el buscador quedaría tapado
    e.preventDefault();
    openFind();
  } else if (mod && key === 'g' && findOpen()) {
    e.preventDefault();
    stepFind(e.shiftKey ? -1 : 1);
  } else if (e.key === 'Escape' && findOpen()) {
    closeFind();
  }
});

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------
async function loadHistory() {
  const q = $('#search').value.trim();
  const favOnly = $('#fav-only').checked;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (favOnly) params.set('favorite', '1');
  const res = await fetch('/api/history?' + params.toString());
  const items = await res.json();
  renderHistory(items);
}

function renderHistory(items) {
  const list = $('#history-list');
  const activeHist = getActiveTab()?.historyId;
  list.innerHTML = '';
  $('#history-empty').classList.toggle('hidden', items.length > 0);

  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'hist-item' + (it.id === activeHist ? ' active' : '');
    const statusClass = it.error ? 'status-err' : `status-${String(it.status)[0]}`;
    const statusTxt = it.error ? 'ERR' : it.status;
    li.innerHTML = `
      <span class="hist-fav ${it.favorite ? 'on' : ''}" title="Favorito">${it.favorite ? '⭐' : '☆'}</span>
      <div class="hist-top">
        <span class="hist-method m-${it.method}">${it.method}</span>
        <span class="hist-url">${escapeHtml(stripProtocol(it.url))}</span>
      </div>
      <div class="hist-meta">
        <span class="hist-status ${statusClass}">${statusTxt}</span>
        <span>${it.durationMs != null ? it.durationMs + ' ms' : ''}</span>
        <span>${relativeTime(it.createdAt)}</span>
      </div>`;
    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('hist-fav')) { toggleFavorite(it.id); return; }
      openHistory(it.id);
    });
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openHistMenu(e, it.id);
    });
    li.addEventListener('mouseenter', (e) => showUrlTip(e, it));
    li.addEventListener('mousemove', moveUrlTip);
    li.addEventListener('mouseleave', hideUrlTip);
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Tooltip con la URL completa (hover sobre un item del historial)
// ---------------------------------------------------------------------------
const urlTip = $('#url-tip');
const URL_TIP_DELAY = 60;
const URL_TIP_OFFSET = 14;
let urlTipTimer;
let urlTipX = 0, urlTipY = 0;

function showUrlTip(e, it) {
  clearTimeout(urlTipTimer);
  urlTipX = e.clientX; urlTipY = e.clientY;
  urlTipTimer = setTimeout(() => {
    // Si la request usaba {{variables}}, mostramos también cómo está guardada.
    const tpl = requestUrlTemplate(it);
    const extra = tpl !== it.url ? `<div class="url-tip-tpl">${escapeHtml(tpl)}</div>` : '';
    urlTip.innerHTML =
      `<span class="url-tip-method m-${escapeAttr(it.method)}">${escapeHtml(it.method)}</span>${escapeHtml(it.url)}${extra}`;
    urlTip.classList.remove('hidden');
    placeUrlTip();
  }, URL_TIP_DELAY);
}

// El cuadro sigue al cursor mientras se recorre el item.
function moveUrlTip(e) {
  urlTipX = e.clientX; urlTipY = e.clientY;
  if (!urlTip.classList.contains('hidden')) placeUrlTip();
}

// Se ubica al costado del cursor, sin salirse de la ventana.
function placeUrlTip() {
  const tw = urlTip.offsetWidth, th = urlTip.offsetHeight;
  let left = urlTipX + URL_TIP_OFFSET;
  if (left + tw > window.innerWidth - 8) left = Math.max(8, urlTipX - URL_TIP_OFFSET - tw);
  let top = urlTipY + URL_TIP_OFFSET;
  if (top + th > window.innerHeight - 8) top = Math.max(8, urlTipY - URL_TIP_OFFSET - th);
  urlTip.style.left = left + 'px';
  urlTip.style.top = top + 'px';
}

function hideUrlTip() {
  clearTimeout(urlTipTimer);
  urlTip.classList.add('hidden');
}

$('#history-list').addEventListener('scroll', hideUrlTip);

// ---------------------------------------------------------------------------
// Ancho del sidebar: arrastrable y persistido
// ---------------------------------------------------------------------------
const SIDEBAR_DEFAULT = 300;
const SIDEBAR_MIN = 220;

function setSidebarWidth(px) {
  const max = Math.max(SIDEBAR_MIN, window.innerWidth - 420);
  const w = Math.min(Math.max(px, SIDEBAR_MIN), max);
  document.documentElement.style.setProperty('--sidebar-w', w + 'px');
  return w;
}

setSidebarWidth(Number(localStorage.getItem('sidebarWidth')) || SIDEBAR_DEFAULT);

$('#sidebar-resizer').addEventListener('mousedown', (e) => {
  e.preventDefault();
  hideUrlTip();
  document.body.classList.add('resizing');
  const startX = e.clientX;
  const startW = $('#sidebar').offsetWidth;

  const onMove = (ev) => setSidebarWidth(startW + (ev.clientX - startX));
  const onUp = (ev) => {
    localStorage.setItem('sidebarWidth', String(setSidebarWidth(startW + (ev.clientX - startX))));
    document.body.classList.remove('resizing');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
});

$('#sidebar-resizer').addEventListener('dblclick', () => {
  localStorage.setItem('sidebarWidth', String(setSidebarWidth(SIDEBAR_DEFAULT)));
});

// Si achican la ventana, el sidebar no puede quedar más ancho que el máximo.
window.addEventListener('resize', () => setSidebarWidth($('#sidebar').offsetWidth));

// ---------------------------------------------------------------------------
// Menú contextual del historial
// ---------------------------------------------------------------------------
const histMenu = $('#hist-menu');
let histMenuId = null;

function openHistMenu(e, id) {
  histMenuId = id;
  histMenu.classList.remove('hidden');
  // Se posiciona en el cursor, corrigiendo si se sale de la ventana.
  const { offsetWidth: w, offsetHeight: h } = histMenu;
  const x = Math.min(e.clientX, window.innerWidth - w - 8);
  const y = Math.min(e.clientY, window.innerHeight - h - 8);
  histMenu.style.left = Math.max(8, x) + 'px';
  histMenu.style.top = Math.max(8, y) + 'px';
}

function closeHistMenu() {
  histMenu.classList.add('hidden');
  histMenuId = null;
}

histMenu.addEventListener('click', async (e) => {
  const action = e.target.dataset.action;
  const id = histMenuId;
  closeHistMenu();
  if (action === 'delete' && id != null) await deleteHistory(id);
});

window.addEventListener('click', (e) => { if (!histMenu.contains(e.target)) closeHistMenu(); });
window.addEventListener('contextmenu', (e) => { if (!e.target.closest('.hist-item')) closeHistMenu(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHistMenu(); });
window.addEventListener('resize', closeHistMenu);
window.addEventListener('scroll', closeHistMenu, true);

async function deleteHistory(id) {
  const res = await fetch('/api/history/' + id, { method: 'DELETE' });
  if (!res.ok) { toast('No se pudo eliminar'); return; }
  // Las pestañas abiertas siguen vivas, pero dejan de apuntar a una fila que ya no existe.
  for (const t of tabs) if (t.historyId === id) t.historyId = null;
  await loadHistory();
  toast('Request eliminada');
}

// Un click en el historial abre la request en una pestaña.
async function openHistory(id) {
  const existing = tabs.find((t) => t.historyId === id);
  if (existing) { switchTab(existing.id); return; }
  const res = await fetch('/api/history/' + id);
  if (!res.ok) return;
  const it = await res.json();
  newTab({
    method: it.method,
    url: requestUrlTemplate(it),
    headers: headersFromHistory(it),
    body: bodyFromHistory(it),
    response: it,
    historyId: it.id,
  });
}

// La URL para reeditar: la que escribiste (con {{variables}}) si la tenemos guardada.
function requestUrlTemplate(it) {
  return it.requestMeta?.url ?? it.url;
}

// Ídem con los headers: requestMeta conserva las filas deshabilitadas y las {{variables}};
// request_headers trae lo que realmente viajó (ya resuelto y con el Content-Type automático).
function headersFromHistory(it) {
  if (Array.isArray(it.requestMeta?.headers)) {
    return it.requestMeta.headers.map((h) => ({
      key: h.key || '', value: h.value || '', enabled: h.enabled !== false,
    }));
  }
  return Object.entries(it.requestHeaders || {}).map(([k, v]) => ({ key: k, value: v, enabled: true }));
}

// El historial guarda el modo y las filas del body; los archivos hay que volver a elegirlos.
function bodyFromHistory(it) {
  const b = emptyBody();
  const meta = it.bodyMeta;
  if (meta && BODY_MODES.includes(meta.mode)) {
    b.mode = meta.mode;
    if (meta.raw) b.raw = { text: meta.raw.text || '', lang: meta.raw.lang || 'json' };
    if (meta.graphql) b.graphql = { query: meta.graphql.query || '', variables: meta.graphql.variables || '' };
    if (meta.urlencoded) b.urlencoded = meta.urlencoded;
    if (meta.formData) b.formData = meta.formData;
    if (meta.binary) b.binary = { file: null, fileName: meta.binary.fileName || '', contentType: meta.binary.contentType || '' };
    return b;
  }
  // Requests viejas (o hechas contra la API a mano): solo tenemos el texto.
  if (it.requestBody) {
    b.mode = 'raw';
    b.raw = { text: it.requestBody, lang: guessRawLang(headerValue(it.requestHeaders, 'content-type'), it.requestBody) };
  }
  return b;
}

function headerValue(headers, name) {
  const n = name.toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) if (k.toLowerCase() === n) return v;
  return '';
}

function guessRawLang(contentType, text) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('json')) return 'json';
  if (ct.includes('xml')) return 'xml';
  if (ct.includes('html')) return 'html';
  if (ct.includes('javascript')) return 'javascript';
  if (ct.includes('text/plain')) return 'text';
  if (/^\s*[[{]/.test(text || '')) return 'json';
  return 'text';
}

async function toggleFavorite(id) {
  await fetch(`/api/history/${id}/favorite`, { method: 'POST' });
  await loadHistory();
}

let searchTimer;
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadHistory, 180);
});
$('#fav-only').addEventListener('change', loadHistory);

// ---------------------------------------------------------------------------
// Importar cURL (abre una pestaña nueva con la request)
// ---------------------------------------------------------------------------
$('#import-curl').addEventListener('click', () => $('#curl-modal').classList.remove('hidden'));
$('#curl-cancel').addEventListener('click', () => $('#curl-modal').classList.add('hidden'));
$('#curl-modal').addEventListener('click', (e) => { if (e.target.id === 'curl-modal') $('#curl-modal').classList.add('hidden'); });
$('#curl-parse').addEventListener('click', () => {
  const parsed = parseCurl($('#curl-input').value);
  if (!parsed) { toast('No pude interpretar ese curl'); return; }
  const headers = Object.entries(parsed.headers || {}).map(([k, v]) => ({ key: k, value: v, enabled: true }));
  newTab({
    method: parsed.method,
    url: parsed.url,
    headers,
    body: parsed.body,
  });
  $('#curl-modal').classList.add('hidden');
  $('#curl-input').value = '';
  // Los archivos no viajan dentro del comando: hay que volver a elegirlos a mano.
  const pendientes = parsed.body.mode === 'binary'
    ? !!parsed.body.binary.fileName
    : parsed.body.formData.some((r) => r.kind === 'file');
  toast(pendientes ? 'cURL importado ✅ — volvé a elegir los archivos' : 'cURL importado ✅');
});

// ---------------------------------------------------------------------------
// Variables reutilizables ({{nombre}})
// ---------------------------------------------------------------------------
let variables = {}; // nombre -> valor

async function loadVars() {
  try {
    const res = await fetch('/api/vars');
    const list = await res.json();
    variables = Object.fromEntries(list.map((v) => [v.name, v.value]));
  } catch { variables = {}; }
}

// Reemplaza {{nombre}} por su valor. Si la variable no existe, deja el texto tal cual.
function applyVars(str) {
  if (str == null) return str;
  return String(str).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : m);
}

$('#open-vars').addEventListener('click', () => {
  varsEditor.setRows(Object.entries(variables).map(([k, v]) => ({ key: k, value: v, enabled: true })));
  $('#vars-modal').classList.remove('hidden');
});
$('#vars-close').addEventListener('click', () => $('#vars-modal').classList.add('hidden'));
$('#vars-modal').addEventListener('click', (e) => { if (e.target.id === 'vars-modal') $('#vars-modal').classList.add('hidden'); });
$('#vars-save').addEventListener('click', async () => {
  const obj = varsEditor.get(); // {nombre: valor} (solo habilitadas y con nombre)
  const list = Object.entries(obj).map(([name, value]) => ({ name, value }));
  await fetch('/api/vars', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(list),
  });
  variables = obj;
  $('#vars-modal').classList.add('hidden');
  toast('Variables guardadas ✅');
});

// ---------------------------------------------------------------------------
// Exportar cURL (arma el comando a partir de la request actual)
// ---------------------------------------------------------------------------
function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

function buildCurl() {
  const method = $('#method').value.toUpperCase();
  const url = applyVars($('#url').value.trim());
  const b = readBodyState();

  const headers = {};
  for (const [k, v] of Object.entries(headersEditor.get())) headers[applyVars(k)] = applyVars(v);
  // curl arma solo el Content-Type de -F (necesita el boundary), el resto lo explicitamos.
  const auto = b.mode === 'form-data' ? '' : autoContentType(b);
  if (auto && !headerValue(headers, 'content-type')) headers['Content-Type'] = auto;

  const parts = ['curl'];
  if (method && method !== 'GET') parts.push(`-X ${method}`);
  parts.push(shellQuote(url));
  for (const [k, v] of Object.entries(headers)) parts.push(`-H ${shellQuote(`${k}: ${v}`)}`);

  switch (b.mode) {
    case 'raw':
      if (b.raw.text) parts.push(`--data-raw ${shellQuote(applyVars(b.raw.text))}`);
      break;
    case 'urlencoded':
      for (const r of b.urlencoded) {
        if (r.enabled === false || !r.key.trim()) continue;
        parts.push(`--data-urlencode ${shellQuote(`${applyVars(r.key)}=${applyVars(r.value)}`)}`);
      }
      break;
    case 'form-data':
      for (const r of b.formData) {
        if (r.enabled === false || !r.key.trim()) continue;
        const value = r.kind === 'file' ? `@${r.fileName || 'archivo'}` : applyVars(r.value);
        parts.push(`-F ${shellQuote(`${applyVars(r.key)}=${value}`)}`);
      }
      break;
    case 'binary':
      parts.push(`--data-binary ${shellQuote(`@${b.binary.fileName || 'archivo'}`)}`);
      break;
    case 'graphql': {
      let variables = {};
      const raw = (b.graphql.variables || '').trim();
      if (raw) { try { variables = JSON.parse(applyVars(raw)); } catch { variables = {}; } }
      parts.push(`--data-raw ${shellQuote(JSON.stringify({ query: applyVars(b.graphql.query), variables }))}`);
      break;
    }
  }
  // Salto de línea con "\" para que sea legible y aún pegable en la terminal.
  return parts.join(' \\\n  ');
}

$('#export-curl').addEventListener('click', () => {
  const url = $('#url').value.trim();
  if (!url) { toast('Ingresá una URL primero'); return; }
  $('#export-output').value = buildCurl();
  $('#export-modal').classList.remove('hidden');
});
$('#export-close').addEventListener('click', () => $('#export-modal').classList.add('hidden'));
$('#export-modal').addEventListener('click', (e) => { if (e.target.id === 'export-modal') $('#export-modal').classList.add('hidden'); });
$('#export-copy').addEventListener('click', () => {
  navigator.clipboard.writeText($('#export-output').value).then(() => {
    toast('Comando copiado ✅');
    $('#export-modal').classList.add('hidden');
  });
});

function parseCurl(input) {
  if (!input || !input.trim()) return null;
  let str = input.trim().replace(/\\\r?\n/g, ' ');
  const tokens = tokenize(str);
  if (!tokens.length) return null;
  if (tokens[0] === 'curl') tokens.shift();

  const out = {
    method: null, url: null, headers: {},
    data: [],          // -d / --data-raw / --data-binary / --data-ascii
    urlencode: [],     // --data-urlencode
    forms: [],         // -F / --form / --form-string
    uploadFile: null,  // -T / --upload-file
    binaryFile: null,  // --data-binary @archivo
    asGet: false,      // -G: los datos van al query string
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => tokens[++i];
    switch (true) {
      case t === '-X' || t === '--request':
        out.method = (next() || 'GET').toUpperCase(); break;
      case t === '-H' || t === '--header': {
        const h = next() || '';
        const idx = h.indexOf(':');
        if (idx > -1) out.headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
        break;
      }
      case t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-ascii': {
        const v = next() || '';
        // curl con -d @archivo manda el contenido del archivo; nosotros solo sabemos el nombre.
        if (t !== '--data-raw' && v.startsWith('@')) out.binaryFile = baseName(v.slice(1));
        else out.data.push(v);
        break;
      }
      case t === '--data-binary': {
        const v = next() || '';
        if (v.startsWith('@')) out.binaryFile = baseName(v.slice(1));
        else out.data.push(v);
        break;
      }
      case t === '--data-urlencode':
        out.urlencode.push(next() || ''); break;
      case t === '-F' || t === '--form':
        out.forms.push(parseFormPart(next() || '', false)); break;
      case t === '--form-string':
        out.forms.push(parseFormPart(next() || '', true)); break;
      case t === '-T' || t === '--upload-file':
        out.uploadFile = baseName(next() || ''); break;
      case t === '-u' || t === '--user': {
        const cred = next() || '';
        out.headers['Authorization'] = 'Basic ' + btoa(cred); break;
      }
      case t === '-A' || t === '--user-agent':
        out.headers['User-Agent'] = next() || ''; break;
      case t === '-e' || t === '--referer':
        out.headers['Referer'] = next() || ''; break;
      case t === '-b' || t === '--cookie':
        out.headers['Cookie'] = next() || ''; break;
      case t === '-G' || t === '--get':
        out.asGet = true; break;
      case t === '-I' || t === '--head':
        out.method = 'HEAD'; break;
      case t === '--url':
        out.url = next() || out.url; break;
      case ['-L', '--location', '-s', '--silent', '-k', '--insecure', '-v', '--verbose',
            '--compressed', '-f', '--fail', '-S', '--show-error', '-i', '--include',
            '-#', '--progress-bar', '-N', '--no-buffer'].includes(t):
        break;
      case ['-o', '--output', '-w', '--write-out', '--connect-timeout', '--max-time',
            '-x', '--proxy', '--cacert', '--cert', '--key', '-m', '--retry',
            '--resolve', '-c', '--cookie-jar'].includes(t):
        next(); break;
      default:
        if (t.startsWith('http://') || t.startsWith('https://')) out.url = t;
        else if (!t.startsWith('-') && !out.url) out.url = t;
    }
  }

  if (!out.url) return null;
  return curlToRequest(out);
}

// -F 'clave=valor' | -F 'clave=@archivo;type=...' | -F 'clave=<archivo'
function parseFormPart(s, forceText) {
  const i = s.indexOf('=');
  if (i < 0) return { key: s, kind: 'text', value: '', enabled: true };
  const key = s.slice(0, i);
  const rest = s.slice(i + 1);
  if (!forceText && (rest.startsWith('@') || rest.startsWith('<'))) {
    const [path] = rest.slice(1).split(';');
    return { key, kind: 'file', value: '', fileName: baseName(path), enabled: true };
  }
  // Los atributos ;type= / ;filename= son metadatos de curl, no parte del valor.
  return { key, kind: 'text', value: rest.replace(/;(type|filename|headers)=[^;]*$/i, ''), enabled: true };
}

function baseName(p) { return String(p).split(/[\\/]/).pop() || String(p); }

// --data-urlencode acepta 'contenido', 'nombre=contenido' y '=contenido'.
function splitUrlencodePart(s) {
  const i = s.indexOf('=');
  if (i < 0) return { key: s, value: '' };
  return { key: s.slice(0, i), value: s.slice(i + 1) };
}

// Decide el modo de body a partir de lo que traía el comando.
function curlToRequest(c) {
  const headers = { ...c.headers };
  const ct = (headerValue(headers, 'content-type') || '').toLowerCase();
  let url = c.url;
  const body = emptyBody();

  if (c.forms.length) {
    body.mode = 'form-data';
    body.formData = c.forms;
    // El boundary lo tiene que poner fetch, así que no arrastramos el header de curl.
    if (/^multipart\/form-data/.test(ct) && !/boundary=/.test(ct)) {
      for (const k of Object.keys(headers)) if (k.toLowerCase() === 'content-type') delete headers[k];
    }
  } else if (c.asGet) {
    // -G: todo lo que era body se va al query string.
    const qs = [
      ...c.urlencode.map((s) => {
        const { key, value } = splitUrlencodePart(s);
        return key ? `${key}=${encodeURIComponent(value)}` : encodeURIComponent(value);
      }),
      ...c.data,
    ].filter(Boolean);
    if (qs.length) url += (url.includes('?') ? '&' : '?') + qs.join('&');
  } else if (c.binaryFile || c.uploadFile) {
    body.mode = 'binary';
    body.binary = { file: null, fileName: c.binaryFile || c.uploadFile, contentType: ct };
  } else if (c.urlencode.length) {
    body.mode = 'urlencoded';
    body.urlencoded = c.urlencode.map((s) => ({ ...splitUrlencodePart(s), enabled: true }));
  } else if (c.data.length) {
    const text = c.data.join('&');
    const gql = detectGraphql(text, ct);
    if (gql) {
      body.mode = 'graphql';
      body.graphql = gql;
    } else if (ct.includes('x-www-form-urlencoded') || (!ct && /^[^\s{[<]+=[^&]*(&|$)/.test(text))) {
      body.mode = 'urlencoded';
      body.urlencoded = [...new URLSearchParams(text)].map(([key, value]) => ({ key, value, enabled: true }));
    } else {
      body.mode = 'raw';
      body.raw = { text, lang: guessRawLang(ct, text) };
    }
  }

  let method = c.method;
  if (!method) {
    if (c.uploadFile) method = 'PUT';
    else if (c.asGet || body.mode === 'none') method = 'GET';
    else method = 'POST';
  }
  return { method, url, headers, body };
}

// Postman detecta GraphQL cuando el JSON trae una query; hacemos lo mismo.
function detectGraphql(text, ct) {
  if (ct && !ct.includes('json')) return null;
  let obj;
  try { obj = JSON.parse(text); } catch { return null; }
  if (!obj || typeof obj.query !== 'string') return null;
  const looksGql = 'variables' in obj || 'operationName' in obj
    || /^\s*(query|mutation|subscription|fragment|\{)/.test(obj.query);
  if (!looksGql) return null;
  return {
    query: obj.query,
    variables: obj.variables == null ? '' : JSON.stringify(obj.variables, null, 2),
  };
}

function tokenize(str) {
  const tokens = [];
  let cur = '', quote = null, has = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) {
      if (c === quote) { quote = null; }
      else if (c === '\\' && quote === '"') { cur += str[++i] ?? ''; }
      else cur += c;
    } else if (c === '"' || c === "'") { quote = c; has = true; }
    else if (/\s/.test(c)) { if (has || cur) { tokens.push(cur); cur = ''; has = false; } }
    else cur += c;
  }
  if (has || cur) tokens.push(cur);
  return tokens;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function stripProtocol(u) { return u.replace(/^https?:\/\//, ''); }
function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
function relativeTime(iso) {
  const d = new Date(iso), now = new Date(), s = Math.floor((now - d) / 1000);
  if (s < 60) return 'hace instantes';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return d.toLocaleDateString();
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

// Cmd/Ctrl+A dentro del panel de respuesta selecciona SOLO ese contenido.
$$('.output').forEach((el) => {
  el.setAttribute('tabindex', '0');
  el.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
});

// Expuestas para los atajos del menú de Electron (Cmd+T / Cmd+W / Cmd+F / Cmd+Enter).
window.__pgNewTab = () => newTab();
window.__pgCloseTab = () => { if (activeTabId) closeTab(activeTabId); };
window.__pgFind = () => { if (!$('.modal:not(.hidden)')) openFind(); };
window.__pgSend = () => trySend();

// Init: variables + primera pestaña vacía + historial.
loadVars();
newTab();
