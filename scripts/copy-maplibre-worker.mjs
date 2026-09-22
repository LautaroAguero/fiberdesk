/**
 * Copies MapLibre GL's worker module (and the shared chunk it imports) from
 * node_modules into public/maplibre/, so the browser can load it from a
 * stable URL.
 *
 * Why: MapLibre 6 locates its worker with `new URL("./maplibre-gl-worker.mjs",
 * import.meta.url)`. Turbopack rewrites `import.meta.url` but does not emit
 * the worker file, so the request falls through to Next's HTML 404 and the map
 * never loads. `NetworkMap` points MapLibre at the copy with `setWorkerUrl`
 * (see MAPLIBRE_WORKER_URL in src/lib/map/config.ts).
 *
 * Runs before `dev` and `build`. The copy is git-ignored; node_modules is the
 * source of truth, so the worker always matches the installed library version.
 */

import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const source = path.join("node_modules", "maplibre-gl", "dist");
const target = path.join("public", "maplibre");

mkdirSync(target, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(source, file), path.join(target, file));
}
