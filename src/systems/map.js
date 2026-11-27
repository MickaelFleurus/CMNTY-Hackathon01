// Placeholder "gray zone" ground: a band of grass-variant tiles that recenters
// around the camera each frame, so the player can walk forever with no real
// level. Real map generation comes later (docs/tasks.md task 1).
import { CFG } from "../config.js";

const TILE_ART = "tiles-grass"; // 4 seamless variants in row 0 of the sheet

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
    const variant = i % 4; // mix the 4 seamless ground variants randomly-ish
    tiles.push(ground.add([
      sprite(TILE_ART, { frame: variant }),
      scale(tileScale),
      pos(
        (i % gridW) * size,
        Math.floor(i / gridW) * size,
      ),
    ]));
  }

  ground.onUpdate(() => {
    // snap the tile band to the camera so it always covers the viewport;
    // aligned to the tile grid so tiling never shifts under the player
    const cam = camPos();
    const startX = cam.x - (gridW * size) / 2;
    const startY = cam.y - (gridH * size) / 2;
    ground.pos = vec2(
      Math.floor(startX / size) * size,
      Math.floor(startY / size) * size,
    );
  });

  return ground;
}
