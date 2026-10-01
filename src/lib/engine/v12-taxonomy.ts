import { decorativeComponentIds, v12PartMetadata } from './definition';
import type { PartId } from './types';

/** Labels are derived from audited roles and vendor assembly paths, not inferred production BOMs. */
export const V12_TAXONOMY = [
	{
		id: 'structure',
		title: 'Block & sump',
		parent: 'block',
		description: 'The cylinder block and oil-sump source bodies.'
	},
	{
		id: 'crank',
		title: 'Crankshaft & flywheel',
		parent: 'block',
		description: 'The principal rotating shaft and flywheel.'
	},
	{
		id: 'pistons',
		title: 'Pistons',
		parent: 'block',
		description: 'Twelve source piston bodies. Rings and pins may be combined in these bodies.'
	},
	{
		id: 'rods',
		title: 'Connecting rods',
		parent: 'block',
		description: 'Twelve source connecting-rod bodies.'
	},
	{
		id: 'liners',
		title: 'Cylinder liners',
		parent: 'block',
		description: 'Twelve source cylinder sleeves.'
	},
	{
		id: 'heads',
		title: 'Head castings',
		parent: 'heads',
		description: 'The two cylinder-head castings, separated from their seats and guides.'
	},
	{
		id: 'seats-guides',
		title: 'Valve seats & guides',
		parent: 'heads',
		description: 'Source bodies named seat ring and valve guide in the purchased assembly.'
	},
	{
		id: 'camshafts',
		title: 'Camshafts & bearings',
		parent: 'heads',
		description: 'Four camshafts and audited bearing-support bodies.'
	},
	{
		id: 'valves-tappets',
		title: 'Valve pins & tappets',
		parent: 'heads',
		description:
			'Source components explicitly named valve pin or tappet. The naming follows the vendor CAD.'
	},
	{
		id: 'springs',
		title: 'Spring assemblies',
		parent: 'heads',
		description:
			'Bodies inside the source spring assemblies, including associated retainers. Body count is not spring count.'
	},
	{
		id: 'covers',
		title: 'Engine covers',
		parent: 'heads',
		description: 'Cam and timing covers, excluding decorative text bodies.'
	},
	{
		id: 'chains',
		title: 'Timing chains',
		parent: 'accessories',
		description:
			'Source chain links are arranged as coherent chain loops while remaining individually selectable.'
	},
	{
		id: 'sprockets',
		title: 'Sprockets & pinions',
		parent: 'accessories',
		description: 'Timing-drive wheels and pinions named in the source assembly.'
	},
	{
		id: 'tensioners',
		title: 'Chain tensioners',
		parent: 'accessories',
		description: 'The source chain-tensioner components.'
	},
	{
		id: 'intake',
		title: 'Intake manifolds',
		parent: 'air',
		description: 'The purchased inlet-manifold bodies.'
	},
	{
		id: 'turbo-rotors',
		title: 'Turbocharger rotors',
		parent: 'turbo',
		description: 'Compressor and turbine rotors identified by the source assembly paths.'
	},
	{
		id: 'turbo-housings',
		title: 'Turbo housings & clamps',
		parent: 'turbo',
		description: 'Compressor covers, turbine and bearing housings, and V-band clamps.'
	},
	{
		id: 'exhaust',
		title: 'Exhaust manifolds',
		parent: 'exhaust',
		description: 'The source exhaust bodies and manifolds.'
	},
	{
		id: 'fuel',
		title: 'Injection & glow plugs',
		parent: 'fuel',
		description:
			'Four combined source bodies; this is not a count of individual injectors or glow plugs.'
	},
	{
		id: 'cooling',
		title: 'Cooling components',
		parent: 'cooling',
		description: 'The source heat-exchanger and water-tank-cover bodies.'
	},
	{
		id: 'fasteners',
		title: 'Fasteners',
		parent: 'accessories',
		description: 'Individually selectable fastener bodies from the vendor bolt assemblies.'
	},
	{
		id: 'unclassified',
		title: 'Unclassified bodies',
		parent: 'accessories',
		description:
			'Two unnamed source bodies retained without assigning an unsupported mechanical function.'
	}
] as const satisfies readonly { id: string; title: string; parent: PartId; description: string }[];

export type V12TaxonomyId = (typeof V12_TAXONOMY)[number]['id'];
export type V12TaxonomyEntry = (typeof V12_TAXONOMY)[number];

type TaxonomySource = { role: string; path?: string; sourcePath?: string };
const taxonomyById = new Map<string, V12TaxonomyEntry>(
	V12_TAXONOMY.map((group) => [group.id, group])
);

export function getV12TaxonomyGroup(part: TaxonomySource): V12TaxonomyEntry {
	const path = (part.path ?? part.sourcePath ?? '').toLowerCase();
	let id: V12TaxonomyId;
	switch (part.role) {
		case 'block':
		case 'sump':
			id = 'structure';
			break;
		case 'crankshaft':
		case 'flywheel':
			id = 'crank';
			break;
		case 'piston':
			id = 'pistons';
			break;
		case 'rod':
			id = 'rods';
			break;
		case 'liner':
			id = 'liners';
			break;
		case 'head':
			id = /\/(seat ring|valve guide)/.test(path) ? 'seats-guides' : 'heads';
			break;
		case 'camshaft':
		case 'bearings':
			id = 'camshafts';
			break;
		case 'valvetrain':
			id = /\/spring/.test(path) ? 'springs' : 'valves-tappets';
			break;
		case 'covers':
			id = 'covers';
			break;
		case 'timing':
			id = /\/chain:1\/chain\//.test(path)
				? 'chains'
				: /\/chain tension/.test(path)
					? 'tensioners'
					: 'sprockets';
			break;
		case 'intake':
			id = 'intake';
			break;
		case 'turbo':
			id = /\/(?:compresssor|turbine)(?=:|\/|\.)/.test(path) ? 'turbo-rotors' : 'turbo-housings';
			break;
		case 'exhaust':
			id = 'exhaust';
			break;
		case 'fuel':
			id = 'fuel';
			break;
		case 'cooling':
			id = 'cooling';
			break;
		case 'fasteners':
			id = 'fasteners';
			break;
		default:
			id = 'unclassified';
	}
	return taxonomyById.get(id)!;
}

export const v12TaxonomyByComponent = new Map(
	[...v12PartMetadata.values()].map((part) => [part.id, getV12TaxonomyGroup(part)])
);

export const V12_ATLAS_CATEGORIES = V12_TAXONOMY.map((group) => {
	const componentIds = [...v12PartMetadata.values()]
		.filter(
			(part) =>
				!decorativeComponentIds.has(part.id) && v12TaxonomyByComponent.get(part.id)?.id === group.id
		)
		.map((part) => part.id);
	return { ...group, componentIds, count: componentIds.length };
});

/** The browser and scene share the same category identities and search terms. */
export function searchV12AtlasCategories(query: string) {
	const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
	return V12_ATLAS_CATEGORIES.filter((group) => {
		const searchable =
			`${group.title} ${group.description} ${group.componentIds.join(' ')}`.toLowerCase();
		return terms.every((term) => searchable.includes(term));
	});
}
