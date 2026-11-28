// Placeholder "gray zone" ground: a band of grass-variant tiles that recenters
// around the camera each frame, so the player can walk forever with no real
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

  const ground = add([
    pos(0, 0),
    z(-10),
    "ground",
  ]);

  // The band covers the screen with a tile of margin on every side (desktop
  // 1280x720: 30 x 18 tiles, the same as CFG.map.gridW / gridH).
  // On phones the view follows the screen's shape (CFG.viewport.fill: tall
  // in portrait, wide in landscape, and rotating resizes it), so the band is
  // rebuilt whenever the screen needs more or fewer tiles.
  const needW = () => Math.ceil(width() / size) + 3; // 1280 / 48 -> 30 (= CFG.map.gridW)
  const needH = () => Math.ceil(height() / size) + 3; // 720 / 48 -> 18 (= CFG.map.gridH)
  let gridW = 0;
  let gridH = 0;
  let tiles = [];

  function buildTiles() {
    tiles.forEach((t) => t.destroy());
    gridW = needW();
    gridH = needH();
    tiles = [];
    for (let i = 0; i < gridW * gridH; i++) {
      tiles.push(ground.add([
        sprite(TILE_ART, { frame: 0 }), // real variant set by placeAt()
        scale(tileScale),
        pos(
          (i % gridW) * size,
          Math.floor(i / gridW) * size,
        ),
      ]));
    }
    originCol = null; // re-pick every tile on the next update
  }

  // Band origin in world tile coords; re-snap + re-pick variants only when
  // the camera has moved into a new tile.
  let originCol = null;
  let originRow = null;
  buildTiles();

  function placeAt(col, row) {
    originCol = col;
    originRow = row;
    ground.pos = vec2(col * size, row * size);
    tiles.forEach((t, i) => {
      t.frame = frameAt(col + (i % gridW), row + Math.floor(i / gridW));
    });
  }

  ground.onUpdate(() => {
    // the screen changed shape (phone rotation): resize the band first
    if (needW() !== gridW || needH() !== gridH) buildTiles();
    // snap the tile band to the camera so it always covers the viewport;
    // aligned to the tile grid so tiling never shifts under the player
    const cam = getCamPos();
    const col = Math.floor((cam.x - (gridW * size) / 2) / size);
    const row = Math.floor((cam.y - (gridH * size) / 2) / size);
    if (col !== originCol || row !== originRow) placeAt(col, row);
  });

  return ground;
}
