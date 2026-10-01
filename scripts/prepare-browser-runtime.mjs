import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const gmshDirectory = dirname(require.resolve('@loumalouomega/gmsh-wasm'));
await mkdir('static/vendor/gmsh', { recursive: true });
for (const file of [
	'gmsh.mjs',
	'gmsh-core.mjs',
	'gmsh-core.wasm',
	'gmsh-descriptor.mjs',
	'runtime.mjs'
]) {
	await copyFile(join(gmshDirectory, file), join('static/vendor/gmsh', file));
}
await copyFile(join(gmshDirectory, '../LICENSE'), 'static/vendor/gmsh/LICENSE');
await copyFile(require.resolve('coi-serviceworker'), 'static/coi-serviceworker.js');
await writeFile(
	'static/vendor/gmsh/SOURCE.txt',
	'Gmsh WebAssembly runtime: @loumalouomega/gmsh-wasm 0.3.0\n' +
		'GPL-2.0-or-later; original source and build instructions:\n' +
		'https://github.com/loumalouomega/GMSH-JS/tree/v0.3.0\n' +
		'https://github.com/loumalouomega/GMSH-JS\n' +
		'Includes Open CASCADE; see upstream source for third-party notices.\n'
);
console.log('Browser CAD runtime and isolation service worker prepared.');
