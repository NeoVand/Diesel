/** Static-file test server. It has no application routes, solver, credentials or AI proxy. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const root = resolve(option('--root', 'build'));
const port = Number(option('--port', '4198'));
const base = option('--base', '').replace(/\/$/, '');
const types = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.wasm': 'application/wasm',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.glb': 'model/gltf-binary'
};
createServer(async (request, response) => {
	if (!args.includes('--no-isolation')) {
		response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
		response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	}
	response.setHeader('Cache-Control', 'no-cache');
	try {
		const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
		if (!['GET', 'HEAD'].includes(request.method) || (base && !pathname.startsWith(`${base}/`)))
			throw new Error('Not found');
		const relative = pathname.slice(base.length);
		if (relative.startsWith('/api/')) throw new Error('No application API');
		let path = resolve(root, `.${relative}`);
		if (path !== root && !path.startsWith(root + sep)) throw new Error('Invalid path');
		if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
		const bytes = await readFile(path);
		response.writeHead(200, {
			'Content-Type': types[extname(path)] ?? 'application/octet-stream',
			'Content-Length': bytes.length
		});
		response.end(request.method === 'HEAD' ? undefined : bytes);
	} catch {
		response.writeHead(404);
		response.end('Static file not found');
	}
}).listen(port, '127.0.0.1', () => console.log(`Static files: http://127.0.0.1:${port}${base}/`));
