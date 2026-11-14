import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function files(dir) {
  const out = [];
  for (const e of await readdir(path.join(root, dir), {
    withFileTypes: true,
  })) {
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else out.push(p);
  }
  return out;
}
const inputs = [
  ...(await files("src")),
  ...(await files("scripts")),
  ...(await files("public/assets")),
  "index.html",
  "foundation.html",
  "vite.config.js",
  "package.json",
  "package-lock.json",
].sort();
const hash = createHash("sha256");
for (const file of inputs) {
  hash.update(file);
  hash.update("\0");
  hash.update(await readFile(path.join(root, file)));
  hash.update("\0");
}
const sourceDigest = hash.digest("hex");
await writeFile(
  path.join(root, "public/build-info.json"),
  JSON.stringify(
    { shortId: sourceDigest.slice(0, 12), sourceDigest, inputs },
    null,
    2,
  ) + "\n",
);
console.log("Source build ID:", sourceDigest.slice(0, 12));
