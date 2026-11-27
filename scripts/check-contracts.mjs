#!/usr/bin/env node
// Static checks for the cross-system contracts in docs/tasks.md ("Shared
// contract"). Catches mistakes that break gameplay WITHOUT any console error
// (so the smoke test can't see them). Run: node scripts/check-contracts.mjs [dir]
// Exit 1 on any violation. scripts/feature.sh finish runs this before pushing.
//
// When you change a contract in docs/tasks.md, add a check for it here.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] || "src";
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".js")) files.push(p);
  }
})(root);

const problems = [];
const report = (file, line, msg) =>
  problems.push(`${relative(process.cwd(), file)}:${line}  ${msg}`);

// Strip // and /* */ comments but keep line breaks, so line numbers survive.
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

for (const file of files) {
  const src = stripComments(readFileSync(file, "utf8"));

  // 1. Enemies have no area(): KAPLAY collision events on "enemy" never fire.
  for (const m of src.matchAll(/onCollide(?:Update|End)?\s*\(([^)]*)/g)) {
    if (/["'`]enemy["'`]/.test(m[1])) {
      report(file, lineOf(src, m.index),
        'onCollide*(…, "enemy") never fires: enemies are not in KAPLAY\'s collision ' +
        'system. Projectiles: give them a numeric `damage` prop (enemies.js applies it). ' +
        "See docs/tasks.md → Shared contract.");
    }
  }

  // 2. Every add([...]) that tags "projectile" must carry a damage prop,
  //    otherwise enemies.js ignores it and it hits nothing.
  for (const m of src.matchAll(/\badd\s*\(\s*\[/g)) {
    // find the matching ] of this add([ ... ])
    let depth = 0, end = -1;
    for (let i = m.index + m[0].length - 1; i < src.length; i++) {
      if (src[i] === "[") depth++;
      else if (src[i] === "]" && --depth === 0) { end = i; break; }
    }
    if (end < 0) continue;
    const body = src.slice(m.index, end);
    if (/["'`]projectile["'`]/.test(body) && !/\bdamage\s*[:,}]/.test(body)) {
      report(file, lineOf(src, m.index),
        'object tagged "projectile" has no `damage` prop: enemies.js only hits ' +
        "projectiles with a numeric `damage`. See docs/tasks.md → Shared contract.");
    }
  }
}

if (problems.length) {
  console.error(`✗ contract check failed (${problems.length}):\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`✓ contract check passed (${files.length} files in ${root}/)`);
