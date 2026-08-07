// Genera build/icon.png (1024x1024) sin dependencias: dibuja pixeles y los
// comprime como PNG con zlib. Cuadrado redondeado naranja + herradura (rodeo/campo).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZE = 1024;
const buf = Buffer.alloc(SIZE * SIZE * 4); // RGBA

function set(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const bg = buf.subarray(i, i + 4);
  const sa = a / 255, da = bg[3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) { buf[i] = buf[i+1] = buf[i+2] = buf[i+3] = 0; return; }
  bg[0] = Math.round((r * sa + bg[0] * da * (1 - sa)) / oa);
  bg[1] = Math.round((g * sa + bg[1] * da * (1 - sa)) / oa);
  bg[2] = Math.round((b * sa + bg[2] * da * (1 - sa)) / oa);
  bg[3] = Math.round(oa * 255);
}
const SS = [[0.25,0.25],[0.75,0.25],[0.25,0.75],[0.75,0.75]]; // supersampling 2x2
function coverage(px, py, test) { let c = 0; for (const [ox, oy] of SS) if (test(px + ox, py + oy)) c++; return c; }

// --- Fondo: cuadrado redondeado con gradiente naranja diagonal ---
const radius = 220;
function inRoundedRect(x, y) {
  const max = SIZE - 1;
  const rx = Math.min(x, max - x), ry = Math.min(y, max - y);
  if (rx >= radius || ry >= radius) return true;
  const dx = radius - rx, dy = radius - ry;
  return dx * dx + dy * dy <= radius * radius;
}
const c1 = [255, 138, 92], c2 = [230, 90, 60];
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  const cov = coverage(x, y, inRoundedRect);
  if (!cov) continue;
  const t = (x + y) / (2 * SIZE);
  set(x, y,
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
    Math.round(255 * cov / 4));
}

// --- Herradura (U abierta hacia arriba) en blanco crema ---
const cx = SIZE / 2, cy = SIZE / 2 + 30;
const R = 300, r = 188;                 // radios exterior/interior de la banda
const rm = (R + r) / 2;                 // radio medio
const GAP = 44;                         // semiángulo del hueco superior (en grados)
const capR = (R - r) / 2;               // radio de las puntas redondeadas
const tipAng = [-90 - GAP, -90 + GAP].map((d) => d * Math.PI / 180);
const tips = tipAng.map((a) => [cx + rm * Math.cos(a), cy + rm * Math.sin(a)]);

function inBand(px, py) {
  const dx = px - cx, dy = py - cy, dist = Math.hypot(dx, dy);
  if (dist < r || dist > R) return false;
  const ang = Math.atan2(dy, dx) * 180 / Math.PI; // -90 = arriba
  if (ang > -90 - GAP && ang < -90 + GAP) return false; // hueco arriba
  return true;
}
function inTip(px, py) { return tips.some(([tx, ty]) => Math.hypot(px - tx, py - ty) <= capR); }
const inShoe = (px, py) => inBand(px, py) || inTip(px, py);

for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  const cov = coverage(x, y, inShoe);
  if (cov) set(x, y, 252, 249, 244, Math.round(255 * cov / 4));
}

// --- Agujeros de clavos: puntos oscuros a lo largo de la banda ---
const holeCenters = [-26, 12, 50, 90, 130, 168, 206].map((d) => {
  const a = d * Math.PI / 180;
  return [cx + rm * Math.cos(a), cy + rm * Math.sin(a)];
});
const holeR = 15;
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  for (const [hx, hy] of holeCenters) {
    const cov = coverage(x, y, (px, py) => Math.hypot(px - hx, py - hy) <= holeR);
    if (cov) { set(x, y, 90, 40, 25, Math.round(150 * cov / 4)); break; }
  }
}

// --- Encode PNG ---
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) { raw[y * (SIZE * 4 + 1)] = 0; buf.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4); }
const idat = deflateSync(raw, { level: 9 });
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);

mkdirSync(join(__dirname, '..', 'build'), { recursive: true });
const out = join(__dirname, '..', 'build', 'icon.png');
writeFileSync(out, png);
console.log('Ícono generado:', out, `(${(png.length / 1024).toFixed(0)} KB)`);
