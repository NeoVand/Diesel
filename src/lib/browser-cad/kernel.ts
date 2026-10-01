import type { Gmsh, GmshFS } from '@loumalouomega/gmsh-wasm';
import {
	analyticVolume,
	parameterHash,
	validateGeometry,
	type CadExport,
	type RodCadParams
} from './contracts';
import type { TetMesh } from './elasticity';

export type CadKernel = Gmsh & { FS: GmshFS };
export async function loadKernel(url: string): Promise<CadKernel> {
	const { default: initialize } = await import(/* @vite-ignore */ url);
	const kernel: CadKernel = await initialize({ print: () => {}, printErr: () => {} });
	kernel.initialize();
	kernel.option.setNumber('General.Terminal', 0);
	kernel.option.setNumber('General.NumThreads', 1);
	return kernel;
}

/** The same analytic cylinders/boxes and bores as rod-solid-v1, now in OCCT WASM. */
export function buildRod(kernel: CadKernel, input: RodCadParams): number {
	const p = validateGeometry(input),
		occ = kernel.model.occ;
	kernel.clear();
	kernel.model.add('parametric-rod');
	const cylinder = (radius: number, y: number, depth: number) =>
		occ.addCylinder(0, y, -depth / 2, 0, 0, depth, radius);
	let entities = [3, cylinder(32, 0, p.rodDepthMm)];
	const tools = [3, cylinder(15, p.rodLengthMm, p.rodDepthMm)];
	for (const [width, z, depth] of [
		[p.rodWidthMm, -p.rodDepthMm / 2, p.flangeMm],
		[p.webMm, -p.rodDepthMm / 2 + p.flangeMm, p.rodDepthMm - 2 * p.flangeMm],
		[p.rodWidthMm, p.rodDepthMm / 2 - p.flangeMm, p.flangeMm]
	]) {
		tools.push(3, occ.addBox(-width / 2, 0, z, width, p.rodLengthMm, depth));
	}
	entities = occ.fuse(entities, tools).outDimTags;
	entities = occ.cut(entities, [
		3,
		cylinder(25, 0, p.rodDepthMm + 2),
		3,
		cylinder(9, p.rodLengthMm, p.rodDepthMm + 2)
	]).outDimTags;
	occ.synchronize();
	if (
		entities.length !== 2 ||
		entities[0] !== 3 ||
		kernel.model.getEntities(3).dimTags.length !== 2
	)
		throw new Error('The CAD kernel did not produce one connected solid.');
	return entities[1];
}

export async function exportVerifiedCad(
	kernel: CadKernel,
	input: RodCadParams
): Promise<CadExport> {
	const params = validateGeometry(input),
		tag = buildRod(kernel, params),
		volume = kernel.model.occ.getMass(3, tag).mass,
		expected = analyticVolume(params);
	const error = Math.abs(volume - expected) / expected;
	if (!Number.isFinite(volume) || volume <= 0 || error > 1e-8)
		throw new Error('The exact solid volume disagrees with the analytic union volume.');
	const b = kernel.model.occ.getBoundingBox(3, tag);
	kernel.write('/rod.step');
	const step = Uint8Array.from(kernel.FS.readFile('/rod.step') as Uint8Array);
	kernel.clear();
	kernel.model.add('step-round-trip');
	const imported = kernel.model.occ.importShapes('/rod.step', true).outDimTags;
	kernel.model.occ.synchronize();
	const valid =
		imported.length === 2 && imported[0] === 3 && kernel.model.getEntities(3).dimTags.length === 2;
	const roundVolume = valid ? kernel.model.occ.getMass(3, imported[1]).mass : 0,
		roundError = Math.abs(roundVolume - volume) / volume;
	if (!valid || roundError > 1e-8)
		throw new Error('STEP round-trip did not preserve the single solid and its volume.');
	kernel.FS.unlink('/rod.step');
	return {
		step,
		report: {
			schemaVersion: 'rod-solid-v1',
			parameterHash: await parameterHash(params),
			params,
			kernel: 'OpenCASCADE through Gmsh 5.0.0 / WebAssembly (gmsh-wasm 0.3.0)',
			units: 'mm',
			valid: true,
			solidCount: 1,
			volumeMm3: volume,
			massKg: volume * 7850e-9,
			densityKgM3: 7850,
			densityProvenance: 'Assumed representative steel; not a verified source material',
			boundsMm: { min: [b.xmin, b.ymin, b.zmin], max: [b.xmax, b.ymax, b.zmax] },
			analyticVolumeMm3: expected,
			relativeVolumeError: error,
			stepRoundTripValid: valid,
			stepRoundTripRelativeVolumeError: roundError,
			limitations: [
				'New parametric concept derivative; not the purchased rod feature history.',
				'Sharp shoulders without fillets, cap joint, bolts, bearings or manufacturing tolerances.',
				'Checks cover a connected OCCT volume, independent analytic volume, and STEP round-trip; they do not certify engineering fitness.',
				'Solid analysis uses its separately declared fixture, mesh and material assumptions.'
			]
		}
	};
}

export function meshCurrentSolid(kernel: CadKernel, size: number): TetMesh {
	kernel.model.mesh.clear();
	for (const [name, value] of Object.entries({
		'Mesh.MeshSizeMin': size * 0.6,
		'Mesh.MeshSizeMax': size,
		'Mesh.MeshSizeFromCurvature': 18,
		'Mesh.MeshSizeExtendFromBoundary': 1,
		'Mesh.Algorithm3D': 1,
		'Mesh.ElementOrder': 1,
		'Mesh.Optimize': 1
	}))
		kernel.option.setNumber(name, value);
	kernel.model.mesh.generate(3);
	const nodes = kernel.model.mesh.getNodes(),
		elements = kernel.model.mesh.getElements(3);
	if (elements.elementTypes.length !== 1 || elements.elementTypes[0] !== 4)
		throw new Error('Expected conforming linear tetrahedral elements.');
	if (nodes.nodeTags.length > 45000 || elements.nodeTags[0].length / 4 > 160000)
		throw new Error(
			'This mesh exceeds the browser solver budget. Use the standard refinement level.'
		);
	const lookup = new Map(nodes.nodeTags.map((tag, i) => [tag, i]));
	return {
		points: Float64Array.from(nodes.coord),
		tets: Uint32Array.from(elements.nodeTags[0], (tag) => {
			const i = lookup.get(tag);
			if (i === undefined) throw new Error('Mesh references an unknown node.');
			return i;
		})
	};
}
