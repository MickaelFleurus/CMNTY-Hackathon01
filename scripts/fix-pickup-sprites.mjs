#!/usr/bin/env node
// Fix a defect in the vendored Survivors Starter Kit pickup sheets: in the
// "bob up" frames, the art is drawn one pixel higher but its TOP OUTLINE ROW
// was clipped off in the source PNG, so the top row of gems/hearts disappears
// while they bob up.
//
// For each 4-frame 16x16 strip in gfx/SurvivorsStarterKit_v1.0/Pickups/, a
// frame is "shifted up" when its art starts at the same row as frame 0 but
// ends one row higher. The missing row (one above its top) is restored from
// frame 0's top row. The vendored files are NOT modified (docs/assets.md):
// fixed copies are written next to them as *_fixed.png, only for sheets that
// needed it.
//
// Pure Node (zlib), no dependencies. Run: node scripts/fix-pickup-sprites.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

const DIR = "gfx/SurvivorsStarterKit_v1.0/Pickups";

// --- minimal PNG codec: 8-bit RGBA, non-interlaced -------------------------
function decode(buf) {
  let pos = 8;
  let width, height, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error("expects 8-bit RGBA non-interlaced");
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp, px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  return { width, height, px };
}

function encode({ width, height, px }) {
  const stride = width * 4, raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// --- the fix ----------------------------------------------------------------
const alpha = (img, x, y) => img.px[(y * img.width + x) * 4 + 3];
function rows(img, f, cell) {
  let y0 = cell, y1 = -1;
  for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++)
    if (alpha(img, f * cell + x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { y0, y1 };
}

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".png") && !f.includes("_fixed"))) {
  const img = decode(readFileSync(join(DIR, file)));
  const cell = img.height;
  if (img.width % cell) continue; // not a strip of square frames
  const frames = img.width / cell;
  const ref = rows(img, 0, cell);
  const fixed = [];
  for (let f = 1; f < frames; f++) {
    const r = rows(img, f, cell);
    if (r.y0 === ref.y0 && r.y1 === ref.y1 - 1 && ref.y0 > 0) {
      // shifted up by one with its top row clipped: restore it from frame 0
      const dst = ref.y0 - 1;
      for (let x = 0; x < cell; x++) {
        const s = (ref.y0 * img.width + x) * 4, d = (dst * img.width + f * cell + x) * 4;
        img.px.copy(img.px, d, s, s + 4);
      }
      fixed.push(f);
    }
  }
  if (!fixed.length) continue;
  const out = file.replace(".png", "_fixed.png");
  writeFileSync(join(DIR, out), encode(img));
  console.log(`${file} → ${out}: restored the top row of frame(s) ${fixed.join(", ")}`);
}
