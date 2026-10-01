/** Keep original/local licensed files out of every distributable static build. */
import { rm, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const destination = resolve(process.env.STATIC_OUT_DIR ?? 'build', 'models');
async function strip(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) await strip(path);
		else if (
			/\.(glb|gltf|obj|bin|step|stp|iges|igs|fbx|blend|stl|3ds|max|dae)$/i.test(entry.name) ||
			entry.name === 'v12-clearance-refined.json'
		)
			await rm(path);
	}
}
await strip(destination);
console.log(
	'Static distribution contains application resources, not standalone licensed geometry.'
);
