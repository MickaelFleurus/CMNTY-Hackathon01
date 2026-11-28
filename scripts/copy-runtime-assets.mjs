// The game loads gfx/ and sounds/ by RUNTIME PATH (loadSprite("x",
// "gfx/...")) and enemies.js imports enemy sheets via import.meta.glob.
// Vite bundles glob-imports, but every runtime-pathed loadSprite/loadSound
// breaks in a production build: `vite build` only copies publicDir/ and the
// repo-root asset trees are NOT in it. Dev works because the dev server
// serves the project root as static files; Cloudflare Pages serves dist/ only.
// Fix: after the build, copy the two asset trees into dist/ unchanged so the
// runtime paths resolve as-is.
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
for (const dir of ["gfx", "sounds"]) {
  if (!existsSync(dir)) continue; // sounds/ doesn't exist; sfx are bundled imports
  cpSync(dir, join(dist, dir), { recursive: true });
  console.log(`copied ${dir}/ -> ${dist}/${dir}/`);
}
