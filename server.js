#!/usr/bin/env node
// RodeoViejo — cliente HTTP. Backend proxy + historial en SQLite.
// Sin dependencias externas: usa node:http, node:sqlite y fetch nativo.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 4319;
const PUBLIC_DIR = join(__dirname, 'public');
const DB_PATH = process.env.RODEOVIEJO_DB || join(__dirname, 'rodeoviejo.db');

// ---------------------------------------------------------------------------
// Base de datos
// ---------------------------------------------------------------------------
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT    NOT NULL,
    method        TEXT    NOT NULL,
    url           TEXT    NOT NULL,
    request_headers TEXT,
    request_body  TEXT,
    status        INTEGER,
    status_text   TEXT,
    response_headers TEXT,
    response_body TEXT,
    duration_ms   INTEGER,
    size_bytes    INTEGER,
    error         TEXT,
    favorite      INTEGER NOT NULL DEFAULT 0
  );
`);
// Índice para acelerar búsquedas por texto.
db.exec(`CREATE INDEX IF NOT EXISTS idx_history_url ON history(url);`);

// Columnas agregadas después: en bases viejas hay que sumarlas a mano.
for (const col of ['body_mode TEXT', 'body_meta TEXT']) {
  try { db.exec(`ALTER TABLE history ADD COLUMN ${col}`); } catch { /* ya existía */ }
}

// Variables reutilizables ({{nombre}}) para URL, headers y body.
db.exec(`CREATE TABLE IF NOT EXISTS variables (name TEXT PRIMARY KEY, value TEXT);`);

const insertStmt = db.prepare(`
  INSERT INTO history
    (created_at, method, url, request_headers, request_body,
     status, status_text, response_headers, response_body,
     duration_ms, size_bytes, error, body_mode, body_meta)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function saveHistory(entry) {
  const info = insertStmt.run(
    new Date().toISOString(),
    entry.method,
    entry.url,
    JSON.stringify(entry.requestHeaders || {}),
    entry.requestBody ?? null,
    entry.status ?? null,
    entry.statusText ?? null,
    JSON.stringify(entry.responseHeaders || {}),
    entry.responseBody ?? null,
    entry.durationMs ?? null,
    entry.sizeBytes ?? null,
    entry.error ?? null,
    entry.bodyMode ?? null,
    entry.bodyMeta ? JSON.stringify(entry.bodyMeta) : null,
  );
  return Number(info.lastInsertRowid);
}

function rowToEntry(r) {
  return {
    id: r.id,
    createdAt: r.created_at,
    method: r.method,
    url: r.url,
    requestHeaders: safeParse(r.request_headers, {}),
    requestBody: r.request_body,
    status: r.status,
    statusText: r.status_text,
    responseHeaders: safeParse(r.response_headers, {}),
    responseBody: r.response_body,
    durationMs: r.duration_ms,
    sizeBytes: r.size_bytes,
    error: r.error,
    favorite: !!r.favorite,
    bodyMode: r.body_mode || null,
    bodyMeta: safeParse(r.body_meta, null),
  };
}

function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Armado del body (los tipos que ofrece la UI, tipo Postman)
// ---------------------------------------------------------------------------
const RAW_CONTENT_TYPES = {
  json: 'application/json',
  text: 'text/plain',
  xml: 'application/xml',
  html: 'text/html',
  javascript: 'application/javascript',
};

// Devuelve la clave real del header (respetando cómo la escribió el usuario) o null.
function findHeader(headers, name) {
  const n = name.toLowerCase();
  for (const k of Object.keys(headers || {})) if (k.toLowerCase() === n) return k;
  return null;
}

// Construye lo que se manda por la red y el texto que se guarda en el historial.
// Puede agregar un Content-Type automático si el usuario no puso uno.
function buildRequestBody(spec, headers) {
  const setCt = (v) => { if (!findHeader(headers, 'content-type')) headers['Content-Type'] = v; };

  switch (spec?.mode) {
    case 'raw': {
      const text = spec.raw?.text ?? '';
      if (!text) return { body: null, text: '' };
      setCt(`${RAW_CONTENT_TYPES[spec.raw?.lang] || 'text/plain'}; charset=utf-8`);
      return { body: text, text };
    }

    case 'urlencoded': {
      const p = new URLSearchParams();
      for (const r of spec.urlencoded || []) p.append(r.key, r.value ?? '');
      const text = p.toString();
      setCt('application/x-www-form-urlencoded; charset=utf-8');
      return { body: text, text };
    }

    case 'form-data': {
      const fd = new FormData();
      const lines = [];
      for (const r of spec.formData || []) {
        if (r.kind === 'file') {
          const buf = Buffer.from(r.data || '', 'base64');
          const name = r.fileName || 'archivo';
          fd.append(r.key, new Blob([buf], { type: r.contentType || 'application/octet-stream' }), name);
          lines.push(`${r.key}: @${name} (${buf.length} bytes)`);
        } else {
          fd.append(r.key, r.value ?? '');
          lines.push(`${r.key}: ${r.value ?? ''}`);
        }
      }
      // El boundary lo genera fetch: un Content-Type manual sin boundary rompe al receptor.
      const ctKey = findHeader(headers, 'content-type');
      if (ctKey && /^multipart\/form-data/i.test(headers[ctKey]) && !/boundary=/i.test(headers[ctKey])) {
        delete headers[ctKey];
      }
      return { body: fd, text: lines.join('\n') };
    }

    case 'binary': {
      const buf = Buffer.from(spec.binary?.data || '', 'base64');
      setCt(spec.binary?.contentType || 'application/octet-stream');
      return { body: buf, text: `[binary] ${spec.binary?.fileName || 'archivo'} (${buf.length} bytes)` };
    }

    case 'graphql': {
      const query = spec.graphql?.query || '';
      const varsText = (spec.graphql?.variables || '').trim();
      let variables = {};
      if (varsText) {
        try { variables = JSON.parse(varsText); }
        catch { throw new Error('Las variables de GraphQL no son JSON válido'); }
      }
      const text = JSON.stringify({ query, variables });
      setCt('application/json');
      return { body: text, text };
    }

    default:
      return { body: null, text: '' };
  }
}

// ---------------------------------------------------------------------------
// Ejecución de la request (proxy)
// ---------------------------------------------------------------------------
async function performRequest({ method, url, headers, body, bodyMeta }) {
  const started = process.hrtime.bigint();
  const m = (method || 'GET').toUpperCase();
  const reqHeaders = { ...(headers || {}) };
  // Compatibilidad: si el body llega como string lo tratamos como raw.
  const spec = typeof body === 'string'
    ? { mode: body ? 'raw' : 'none', raw: { text: body, lang: 'text' } }
    : (body || { mode: 'none' });

  let status = null, statusText = null, responseHeaders = {}, responseBody = '', error = null;
  let requestText = '';
  try {
    const init = { method: m, headers: reqHeaders, redirect: 'follow' };
    if (!['GET', 'HEAD'].includes(m)) {
      const built = buildRequestBody(spec, reqHeaders);
      requestText = built.text;
      if (built.body != null && built.body !== '') init.body = built.body;
    }
    const res = await fetch(url, init);
    status = res.status;
    statusText = res.statusText;
    res.headers.forEach((v, k) => { responseHeaders[k] = v; });
    responseBody = await res.text();
  } catch (e) {
    error = e?.message || String(e);
  }

  const durationMs = Number((process.hrtime.bigint() - started) / 1000000n);
  const sizeBytes = responseBody ? Buffer.byteLength(responseBody, 'utf8') : 0;

  const id = saveHistory({
    method: m, url, requestHeaders: reqHeaders, requestBody: requestText || null,
    bodyMode: spec.mode || 'none', bodyMeta: bodyMeta || null,
    status, statusText, responseHeaders, responseBody, durationMs, sizeBytes, error,
  });

  return { id, status, statusText, responseHeaders, responseBody, durationMs, sizeBytes, error };
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function json(res, code, data) {
  const payload = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      // Generoso porque los archivos (form-data / binary) viajan en base64 dentro del JSON.
      if (size > 250 * 1024 * 1024) { reject(new Error('Body demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = join(PUBLIC_DIR, urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  try {
    // --- API ---
    if (pathname === '/api/request' && req.method === 'POST') {
      const payload = safeParse(await readBody(req), null);
      if (!payload || !payload.url) return json(res, 400, { error: 'Falta la URL' });
      const result = await performRequest(payload);
      return json(res, 200, result);
    }

    // --- Variables ---
    if (pathname === '/api/vars' && req.method === 'GET') {
      const rows = db.prepare('SELECT name, value FROM variables ORDER BY name').all();
      return json(res, 200, rows);
    }
    if (pathname === '/api/vars' && req.method === 'PUT') {
      const list = safeParse(await readBody(req), []);
      db.exec('BEGIN');
      try {
        db.exec('DELETE FROM variables');
        const stmt = db.prepare('INSERT OR REPLACE INTO variables (name, value) VALUES (?, ?)');
        for (const v of Array.isArray(list) ? list : []) {
          if (v && v.name) stmt.run(String(v.name), v.value == null ? '' : String(v.value));
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/history' && req.method === 'GET') {
      const q = new URL(req.url, 'http://localhost').searchParams.get('q')?.trim();
      const onlyFav = new URL(req.url, 'http://localhost').searchParams.get('favorite') === '1';
      let rows;
      const where = [];
      const params = [];
      if (q) {
        where.push('(url LIKE ? OR method LIKE ? OR request_body LIKE ? OR response_body LIKE ? OR CAST(status AS TEXT) LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like, like, like, like);
      }
      if (onlyFav) where.push('favorite = 1');
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      rows = db.prepare(`SELECT * FROM history ${clause} ORDER BY id DESC LIMIT 500`).all(...params);
      return json(res, 200, rows.map(rowToEntry));
    }

    if (pathname.startsWith('/api/history/') && req.method === 'GET') {
      const id = Number(pathname.split('/').pop());
      const row = db.prepare('SELECT * FROM history WHERE id = ?').get(id);
      if (!row) return json(res, 404, { error: 'No encontrado' });
      return json(res, 200, rowToEntry(row));
    }

    if (pathname.match(/^\/api\/history\/\d+\/favorite$/) && req.method === 'POST') {
      const id = Number(pathname.split('/')[3]);
      const row = db.prepare('SELECT favorite FROM history WHERE id = ?').get(id);
      if (!row) return json(res, 404, { error: 'No encontrado' });
      const next = row.favorite ? 0 : 1;
      db.prepare('UPDATE history SET favorite = ? WHERE id = ?').run(next, id);
      return json(res, 200, { id, favorite: !!next });
    }

    if (pathname.startsWith('/api/history/') && req.method === 'DELETE') {
      const id = Number(pathname.split('/').pop());
      db.prepare('DELETE FROM history WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/history' && req.method === 'DELETE') {
      db.exec('DELETE FROM history');
      return json(res, 200, { ok: true });
    }

    // --- estáticos ---
    return await serveStatic(req, res);
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
});

export const ready = new Promise((resolve) => {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  🐎 RodeoViejo corriendo en  http://localhost:${PORT}\n  📀 Historial en             ${DB_PATH}\n`);
    resolve(PORT);
  });
});

export { PORT };
