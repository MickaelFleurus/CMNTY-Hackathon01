// Placeholder "gray zone" ground: a band of grass-variant tiles that recenters
// around the camera each frame, so the player can walk forever with no real
// level. Real map generation comes later (docs/tasks.md task 1).
import { CFG } from "../config.js";

const TILE_ART = "tiles-grass"; // 4 seamless variants in row 0 of the sheet
const VARIANTS = 4;

// Variant for a WORLD tile coordinate (stable hash), so a given spot on the
// map always shows the same grass. Picking it from the tile's index inside
// the band made every tile swap art whenever the band re-snapped, so the
// grass looked like it was sliding along with the player.
function variantAt(col, row) {
  let h = (Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h >>> 16) % VARIANTS;
}

export function buildGround() {
  const { tileSize, tileScale, gridW, gridH } = CFG.map;
  const size = tileSize * tileScale;

  const ground = add([
    pos(0, 0),
    z(-10),
    "ground",
  ]);

  const tiles = [];
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

  // Band origin in world tile coords; re-snap + re-pick variants only when
  // the camera has moved into a new tile.
  let originCol = null;
  let originRow = null;

  function placeAt(col, row) {
    originCol = col;
    originRow = row;
    ground.pos = vec2(col * size, row * size);
    tiles.forEach((t, i) => {
      t.frame = variantAt(col + (i % gridW), row + Math.floor(i / gridW));
    });
  }

  ground.onUpdate(() => {
    // snap the tile band to the camera so it always covers the viewport;
    // aligned to the tile grid so tiling never shifts under the player
    const cam = getCamPos();
    const col = Math.floor((cam.x - (gridW * size) / 2) / size);
    const row = Math.floor((cam.y - (gridH * size) / 2) / size);
    if (col !== originCol || row !== originRow) placeAt(col, row);
  });

  return ground;
}
