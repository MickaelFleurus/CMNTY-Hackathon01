// Placeholder "gray zone" ground: grass-variant tiles drawn around the camera
// every frame (exactly what the screen shows), so the player can walk forever with no real
// level. Real map generation comes later (docs/tasks.md task 1).
// Decor (CFG.map.decor): lone flowers, rocks and mushrooms here and there,
// plus circular flower clusters - all picked per world tile, deterministic.
import { CFG } from "../config.js";

const TILE_ART = "tiles-grass"; // row 0: 4 seamless variants; row 1: decor
const VARIANTS = 4;
// Row 1 frames (sliceX 4): flowers, rock, mushroom. Frame 7 (green blob) is
// never used.
const FLOWERS = 4;
const ROCK = 5;
const MUSHROOM = 6;

// Stable hash of a WORLD tile coordinate (+ a salt per use), so a given spot
// on the map always shows the same tile. Picking from the tile's index inside
// the band made every tile swap art whenever the band re-snapped, so the
// grass looked like it was sliding along with the player.
function hash(col, row, salt = 0) {
  let h = (Math.imul(col, 73856093) ^ Math.imul(row, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const rand01 = (col, row, salt) => hash(col, row, salt) / 4294967296;

/** Circular flower cluster of the cell holding (col, row), or null. */
function clusterOf(col, row, d) {
  const cell = d.clusterCell;
  const cx = Math.floor(col / cell);
  const cy = Math.floor(row / cell);
  if (rand01(cx, cy, 11) >= d.clusterChance) return null;
  const [rMin, rMax] = d.clusterRadius;
  const radius = rMin + (rMax - rMin) * rand01(cx, cy, 12);
  // keep the whole circle inside its cell, so neighbours never need checking
  const room = cell - 2 * (radius + 1);
  return {
    x: cx * cell + radius + 1 + room * rand01(cx, cy, 13),
    y: cy * cell + radius + 1 + room * rand01(cx, cy, 14),
    radius,
  };
}

/** Frame for a world tile: grass variant, or a decor tile from row 1. */
function frameAt(col, row) {
  const d = CFG.map.decor;
  // circular flower clusters: denser in the middle, thinning out at the edge
  const c = clusterOf(col, row, d);
  if (c) {
    const dist = Math.hypot(col + 0.5 - c.x, row + 0.5 - c.y);
    if (dist <= c.radius) {
      const [inner, outer] = d.clusterDensity;
      const density = inner + (outer - inner) * (dist / c.radius);
      if (rand01(col, row, 2) < density) return FLOWERS;
    }
  }
  // sporadic decor
  const r = rand01(col, row, 1);
  if (r < d.flowerChance) return FLOWERS;
  if (r < d.flowerChance + d.rockChance) return ROCK;
  if (r < d.flowerChance + d.rockChance + d.mushroomChance) return MUSHROOM;
  return hash(col, row) % VARIANTS;
}

export function buildGround() {
  const { tileSize, tileScale } = CFG.map;
  const size = tileSize * tileScale;

  // The ground is DRAWN, not built from tile objects: every frame it draws
  // exactly the world tiles the camera sees right now (+1 tile of margin),
  // from the camera position of that same frame. So it always covers the
  // whole screen whatever its size - desktop 1280x720, a tall phone, a phone
  // being rotated, or the mobile address bar sliding in and out - with
  // nothing to rebuild and no one-frame lag at the edges while moving.
  // Tiles are drawn 1 px bigger than their spacing so the odd scales of
  // phone screens never leave a hairline gap between them.
  // Which frame a tile shows only depends on its world coords (frameAt), and
  // the frames of the visible block are cached until the view moves a tile.
  const drawScale = (size + 1) / tileSize;
  let key = "";
  let frames = [];
  let block = { col: 0, row: 0, cols: 0, rows: 0 };

  const ground = add([
    pos(0, 0),
    z(-10),
    "ground",
    {
      draw() {
        const cam = getCamPos();
        const zoom = getCamScale?.().x || 1;
        const halfW = width() / zoom / 2;
        const halfH = height() / zoom / 2;
        const col = Math.floor((cam.x - halfW) / size) - 1;
        const row = Math.floor((cam.y - halfH) / size) - 1;
        const cols = Math.ceil((halfW * 2) / size) + 3;
        const rows = Math.ceil((halfH * 2) / size) + 3;
        const k = `${col},${row},${cols},${rows}`;
        if (k !== key) {
          key = k;
          block = { col, row, cols, rows };
          frames = new Array(cols * rows);
          for (let i = 0; i < cols * rows; i++) frames[i] = frameAt(col + (i % cols), row + Math.floor(i / cols));
        }
        for (let i = 0; i < block.cols * block.rows; i++) {
          drawSprite({
            sprite: TILE_ART,
            frame: frames[i],
            pos: vec2((block.col + (i % block.cols)) * size, (block.row + Math.floor(i / block.cols)) * size),
            scale: drawScale,
          });
        }
      },
    },
  ]);

  return ground;
}
