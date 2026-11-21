// MapLibre's web worker can't be bundled by Turbopack ("Worker failed to
// load"), so it is served as a static file: copied from the installed
// package on every install (public/maplibre-gl-worker.mjs, git-ignored), so it
// always matches the MapLibre version in package-lock.json.
import { copyFileSync, existsSync } from "node:fs";

const from = "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs";
if (existsSync(from)) copyFileSync(from, "public/maplibre-gl-worker.mjs");
else console.warn(`copy-maplibre-worker: ${from} not found`);
