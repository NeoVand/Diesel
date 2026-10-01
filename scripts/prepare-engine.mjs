import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

// Input is an extracted copy. The purchased archive is never changed.
const input = process.argv[2] ?? path.join(import.meta.dirname, 'source-engine.obj');
const output = process.argv[3] ?? path.join(import.meta.dirname, 'engine.glb');
await MeshoptSimplifier.ready;
const simplifyRatio = Number(process.env.ENGINE_SIMPLIFY_RATIO ?? 0.23);
if (!(simplifyRatio > 0 && simplifyRatio <= 1))
	throw new Error('ENGINE_SIMPLIFY_RATIO must be between 0 and 1');
const vertices = [],
	normals = [],
	parts = [];
let current = null;
const lines = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity });
for await (const line of lines) {
	if (line.startsWith('v ')) vertices.push(...line.slice(2).trim().split(/\s+/).map(Number));
	else if (line.startsWith('vn ')) normals.push(...line.slice(3).trim().split(/\s+/).map(Number));
	else if (line.startsWith('g ') || line.startsWith('o ')) {
		current = {
			name: line.slice(2).trim(),
			positions: [],
			normals: [],
			indices: [],
			refs: new Map()
		};
		parts.push(current);
	} else if (line.startsWith('f ')) {
		if (!current) throw new Error('Face without group');
		const face = line
			.slice(2)
			.trim()
			.split(/\s+/)
			.map((ref) => {
				if (current.refs.has(ref)) return current.refs.get(ref);
				const [v, , n] = ref.split('/').map(Number);
				const vi = (v > 0 ? v - 1 : vertices.length / 3 + v) * 3;
				const ni = (n > 0 ? n - 1 : normals.length / 3 + n) * 3;
				const index = current.positions.length / 3;
				current.positions.push(vertices[vi], vertices[vi + 1], vertices[vi + 2]);
				current.normals.push(normals[ni] ?? 0, normals[ni + 1] ?? 1, normals[ni + 2] ?? 0);
				current.refs.set(ref, index);
				return index;
			});
		for (let i = 1; i < face.length - 1; i++) current.indices.push(face[0], face[i], face[i + 1]);
	}
}
const gltf = {
	asset: { version: '2.0', generator: 'Diesel purchased OBJ pipeline / meshoptimizer 1.3.0' },
	scene: 0,
	scenes: [{ nodes: [] }],
	nodes: [],
	meshes: [],
	accessors: [],
	bufferViews: [],
	buffers: [],
	materials: [
		{
			name: 'Industrial yellow display paint',
			pbrMetallicRoughness: {
				baseColorFactor: [1, 0.66, 0.014, 1],
				metallicFactor: 0.28,
				roughnessFactor: 0.34
			}
		}
	]
};
const chunks = [];
let offset = 0,
	sourceTriangles = 0,
	triangles = 0;
const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
const manifest = [];
function accessor(array, type, componentType, min, max, target) {
	const b = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
	const view = gltf.bufferViews.length;
	gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: b.length, target });
	chunks.push(b);
	offset += b.length;
	if (offset % 4) {
		const pad = Buffer.alloc(4 - (offset % 4));
		chunks.push(pad);
		offset += pad.length;
	}
	const id = gltf.accessors.length;
	gltf.accessors.push({
		bufferView: view,
		componentType,
		count: array.length / (type === 'SCALAR' ? 1 : 3),
		type,
		...(min ? { min, max } : {})
	});
	return id;
}
for (const part of parts) {
	if (!part.indices.length) continue;
	sourceTriangles += part.indices.length / 3;
	let pos = new Float32Array(part.positions),
		nor = new Float32Array(part.normals),
		ind = new Uint32Array(part.indices);
	const target = Math.floor(Math.max(1200, ind.length * simplifyRatio) / 3) * 3;
	let error = 0;
	if (ind.length > target)
		[ind, error] = MeshoptSimplifier.simplifyWithAttributes(
			ind,
			pos,
			3,
			nor,
			3,
			[0.5, 0.5, 0.5],
			null,
			target,
			0.002,
			['Permissive']
		);
	const [remap, count] = MeshoptSimplifier.compactMesh(ind);
	const outPos = new Float32Array(count * 3),
		outNor = new Float32Array(count * 3);
	for (let v = 0; v < remap.length; v++)
		if (remap[v] !== 0xffffffff) {
			outPos.set(pos.subarray(v * 3, v * 3 + 3), remap[v] * 3);
			outNor.set(nor.subarray(v * 3, v * 3 + 3), remap[v] * 3);
		}
	pos = outPos;
	nor = outNor;
	const min = [Infinity, Infinity, Infinity],
		max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < pos.length; i++) {
		const axis = i % 3;
		min[axis] = Math.min(min[axis], pos[i]);
		max[axis] = Math.max(max[axis], pos[i]);
		bounds.min[axis] = Math.min(bounds.min[axis], pos[i]);
		bounds.max[axis] = Math.max(bounds.max[axis], pos[i]);
	}
	const mesh = gltf.meshes.length,
		node = gltf.nodes.length;
	gltf.meshes.push({
		name: part.name,
		primitives: [
			{
				attributes: {
					POSITION: accessor(pos, 'VEC3', 5126, min, max, 34962),
					NORMAL: accessor(nor, 'VEC3', 5126, null, null, 34962)
				},
				indices: accessor(ind, 'SCALAR', 5125, null, null, 34963),
				material: 0
			}
		]
	});
	gltf.nodes.push({
		name: part.name,
		mesh,
		extras: {
			sourceGroup: part.name,
			semanticMapping: 'inferred-from-position',
			sourceTriangles: part.indices.length / 3,
			simplificationRelativeError: error
		}
	});
	gltf.scenes[0].nodes.push(node);
	triangles += ind.length / 3;
	manifest.push({
		name: part.name,
		sourceTriangles: part.indices.length / 3,
		triangles: ind.length / 3,
		vertices: count,
		min,
		max,
		error
	});
	if (node % 100 === 0) console.log('Prepared', node, 'parts');
	part.positions = null;
	part.normals = null;
	part.indices = null;
	part.refs = null;
}
gltf.buffers.push({ byteLength: offset });
const json = Buffer.from(JSON.stringify(gltf));
const jsonPad = Buffer.alloc((4 - (json.length % 4)) % 4, 32);
const binary = Buffer.concat(chunks);
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67);
head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + json.length + jsonPad.length + 8 + binary.length, 8);
const jsonHead = Buffer.alloc(8);
jsonHead.writeUInt32LE(json.length + jsonPad.length);
jsonHead.writeUInt32LE(0x4e4f534a, 4);
const binHead = Buffer.alloc(8);
binHead.writeUInt32LE(binary.length);
binHead.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(output, Buffer.concat([head, jsonHead, json, jsonPad, binHead, binary]));
fs.writeFileSync(
	output.replace(/\.glb$/, '.manifest.json'),
	JSON.stringify(
		{
			source: path.basename(input),
			sourceTriangles,
			triangles,
			parts: manifest.length,
			bounds,
			bytes: fs.statSync(output).size,
			simplifier: 'meshoptimizer 1.3.0',
			simplifyRatio,
			relativeErrorBudget: 0.002,
			groups: manifest
		},
		null,
		2
	)
);
console.log({
	output,
	sourceTriangles,
	triangles,
	parts: manifest.length,
	bounds,
	bytes: fs.statSync(output).size
});
