import manifest from '../../../static/models/v12-review.manifest.json';
import type { ComponentRecord } from './lab-state';
import type { PartId } from './types';

export const decorativeComponentIds = new Set(
	Array.from({ length: 24 }, (_, index) => `v12-${String(index + 261).padStart(4, '0')}`)
);
const parents: Record<string, PartId> = {
	piston: 'block',
	rod: 'block',
	crankshaft: 'block',
	block: 'block',
	liner: 'block',
	sump: 'block',
	bearings: 'block',
	head: 'heads',
	camshaft: 'heads',
	valvetrain: 'heads',
	covers: 'heads',
	turbo: 'turbo',
	intake: 'air',
	exhaust: 'exhaust',
	fuel: 'fuel',
	cooling: 'cooling',
	flywheel: 'flywheel',
	timing: 'accessories',
	fasteners: 'accessories'
};
export function getV12Parent(role: string): PartId {
	return parents[role] ?? 'accessories';
}
const names: Record<string, string> = {
	piston: 'Piston',
	rod: 'Connecting rod',
	crankshaft: 'Crankshaft',
	block: 'Cylinder block',
	liner: 'Cylinder liner',
	sump: 'Oil sump',
	bearings: 'Bearing support',
	head: 'Cylinder-head body',
	camshaft: 'Camshaft',
	valvetrain: 'Valve-train component',
	covers: 'Cover component',
	turbo: 'Turbocharger component',
	intake: 'Intake component',
	exhaust: 'Exhaust component',
	fuel: 'Fuel and glow-plug assembly',
	cooling: 'Cooling component',
	flywheel: 'Flywheel',
	timing: 'Timing-drive component',
	fasteners: 'Fastener',
	other: 'Source component'
};
export const v12PartMetadata = new Map(
	manifest.parts.map((part) => [
		part.id,
		{ ...part, decorative: decorativeComponentIds.has(part.id) }
	])
);
const ordinals = new Map<string, number>();
export const v12Components: readonly ComponentRecord[] = manifest.parts.map((part) => {
	const number = (ordinals.get(part.role) ?? 0) + 1;
	ordinals.set(part.role, number);
	return {
		id: part.id,
		name: decorativeComponentIds.has(part.id)
			? `Cover lettering ${number}`
			: `${names[part.role] ?? part.sourceName} ${number}`,
		parent: getV12Parent(part.role),
		sourceGroup: part.sourcePath,
		cadProduct: part.sourceName,
		kind: 'source',
		description: `${part.assembly}. Purchased source component; ${part.role} classification from the assembly audit. Some source bodies combine multiple physical pieces. Runtime corrections are listed in component provenance.`,
		material: `Source tag: ${part.sourceMaterial}; display finish authored, physical alloy unverified`,
		triangleCount: part.sourceTriangles,
		confidence: 'visual'
	};
});
export const engineDefinition = {
	assetId: manifest.assetId,
	version: 'v12-2026-09-30',
	name: 'V12 Diesel Engine Lab',
	description:
		'A purchased, brand-neutral quad-turbo diesel concept with actual modeled internals.',
	modelUrl: '/models/v12-review.glb',
	sourceCount: manifest.count,
	mechanicalDisplayCount: manifest.count - decorativeComponentIds.size,
	geometry: {
		cylinders: 12,
		bankAngleDegrees: 60,
		boreMm: 85,
		strokeMm: 100,
		crankRadiusMm: 50,
		rodLengthMm: 125,
		displacementL: ((Math.PI / 4) * 85 ** 2 * 100 * 12) / 1e6,
		provenance:
			'Analytic surfaces and joint-center measurements from purchased STEP; design geometry, not production certification.'
	},
	capabilities: {
		numericPerformance: false,
		calibratedCombustion: false,
		calibratedAcoustics: false,
		mechanicalPlayback: true,
		declaredCycleStudy: true,
		phaseBasis:
			'Crank angle referenced to the supplied source pose; corrected cam indexing defines an explicit teaching cycle, without OEM combustion calibration.',
		registeredSourceParts: manifest.count
	},
	evidence: [
		{
			id: 'V12_CLEARANCE',
			title: 'Derived piston clearances and continuous swept checks',
			url: '/models/v12-clearance-audit.md'
		},
		{
			id: 'V12_TIMING_MOUNTS',
			title: 'Corrected guide mount registration and native solid checks',
			url: '/models/v12-timing-mount-audit.md'
		},
		{
			id: 'V12_CYCLE',
			title: 'Air-standard cylinder cycle: declared case and numerical verification',
			url: '/models/v12-cycle-audit.md'
		},
		{
			id: 'V12_VALVETRAIN',
			title: 'Source-profile valve train: corrections and geometric verification',
			url: '/models/v12-valvetrain-audit.md'
		},
		{
			id: 'V12_TIMING',
			title: 'Corrected timing drive: rigid links, ratios and guide placement',
			url: '/models/v12-timing-audit.md'
		},
		{
			id: 'V12_MOTION',
			title: 'Purchased V12 motion and clearance verification',
			url: '/models/v12-motion-audit.md'
		},
		{
			id: 'V12_GEOMETRY',
			title: 'Purchased V12 native geometry audit',
			url: '/models/v12-audit.md'
		},
		{
			id: 'V12_CATALOG',
			title: 'V12 source component manifest',
			url: '/models/v12-review.manifest.json'
		},
		{
			id: 'V12_DESIGN',
			title: 'V12 concept design and measured geometry',
			url: '/models/v12-audit.md'
		}
	],
	limitations: [
		'This is a compact concept design, not an identified production engine or certified digital twin.',
		'85 mm bore and 100 mm stroke imply approximately 6.81 L; no matched rated power, rpm, fuel or emissions map is supplied.',
		'Measured source joints and cam profiles drive the corrected mechanical rig. Cam clocking and rear-lobe reindexing define twelve evenly spaced teaching events; this is not an authenticated firing order or injection calibration.',
		'Native solid validity does not by itself verify full-cycle clearances, render-mesh cut faces or a complete auxiliary system.',
		'The original source has piston/head and lower-bore corner contacts. Documented native crown and block corrections remove these in the running configuration. Adaptive full-stroke checks of all twelve corrected piston meshes against the block and heads verify a 0.100 mm separation threshold; this scoped check does not establish every engine clearance or manufacturing feasibility.',
		'The running rig articulates the crank group, twelve rods and pistons, 320 rigid chain links, timing wheels, four cams and 48 valves/tappets. Springs deform with fixed wire diameter. Lobe indexing, stem lengths, one tappet axis, guide placements and mounting interfaces, tooth rings and selected crown/block geometry are explicit derived corrections; original purchased geometry remains preserved.',
		'Displayed materials express vendor appearances and presentation choices, not verified production properties.'
	]
} as const;
