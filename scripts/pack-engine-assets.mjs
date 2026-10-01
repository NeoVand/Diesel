/** Package licensed display geometry for incorporation in the application.
 * This deters casual extraction; browser-delivered content cannot be unextractable.
 * Never package editable source CAD or include an AI/API credential here.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash, randomBytes, createCipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const expected = JSON.parse(await readFile(`${root}/src/lib/engine/runtime-assets.json`, 'utf8'));
const destination = `${root}/static/engine-runtime`;
const privateDirectory = `${root}/work/private-assets`;
await mkdir(privateDirectory, { recursive: true });
const keyPath = `${privateDirectory}/package-key`;
let encodedKey = process.env.ENGINE_ASSET_PACKAGE_KEY;
if (!encodedKey) {
	try {
		encodedKey = (await readFile(keyPath, 'utf8')).trim();
	} catch {
		encodedKey = randomBytes(32).toString('base64');
	}
}
const key = Buffer.from(encodedKey, 'base64');
if (key.length !== 32) throw new Error('The resource package key must encode exactly 32 bytes.');
await writeFile(keyPath, encodedKey, { mode: 0o600 });
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = { version: 1, encoding: 'aes-256-gcm+gzip', files: {} };
let rawTotal = 0;
let packagedTotal = 0;
for (const [name, reference] of Object.entries(expected)) {
	const original = await readFile(`${root}/static/models/${name}`);
	if (original.length !== reference.bytes || digest(original) !== reference.sha256)
		throw new Error(`Runtime geometry differs from the verified bundle: ${name}`);
	const compressed = gzipSync(original, { level: 9 });
	if (!gunzipSync(compressed).equals(original))
		throw new Error(`Compression verification failed: ${name}`);
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	// WebCrypto expects the authentication tag appended to the ciphertext.
	const encrypted = Buffer.concat([cipher.update(compressed), cipher.final(), cipher.getAuthTag()]);
	const chunks = [];
	for (let offset = 0; offset < encrypted.length; offset += 8 * 1024 * 1024) {
		const chunk = encrypted.subarray(offset, offset + 8 * 1024 * 1024);
		const filename = `${digest(chunk).slice(0, 24)}.elres`;
		await writeFile(`${destination}/${filename}`, chunk);
		chunks.push({ path: filename, bytes: chunk.length, sha256: digest(chunk) });
	}
	manifest.files[name] = {
		iv: iv.toString('base64'),
		bytes: original.length,
		sha256: reference.sha256,
		chunks
	};
	rawTotal += original.length;
	packagedTotal += encrypted.length;
}
await writeFile(`${destination}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
	`${destination}/NOTICE.txt`,
	'Licensed engine display resources incorporated into Engine Lab.\nThese resources are excluded from any licence covering the application source code.\nNo permission is granted to extract, redistribute, sell or reuse the geometry separately.\nOriginal purchased CAD and editable source files are not included.\n'
);
console.log(
	JSON.stringify({
		files: Object.keys(expected).length,
		sourceBytes: rawTotal,
		packagedBytes: packagedTotal,
		keyStoredPrivately: true
	})
);
