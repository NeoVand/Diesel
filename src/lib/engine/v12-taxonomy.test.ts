import { describe, expect, it } from 'vitest';
import { decorativeComponentIds, v12PartMetadata } from './definition';
import {
	V12_ATLAS_CATEGORIES,
	getV12TaxonomyGroup,
	searchV12AtlasCategories,
	v12TaxonomyByComponent
} from './v12-taxonomy';

describe('source-derived V12 atlas taxonomy', () => {
	it('covers all 1,229 mechanical source bodies exactly once in 22 meaningful categories', () => {
		const ids = V12_ATLAS_CATEGORIES.flatMap((group) => group.componentIds);
		expect(V12_ATLAS_CATEGORIES).toHaveLength(22);
		expect(ids).toHaveLength(1229);
		expect(new Set(ids).size).toBe(1229);
		expect(new Set(ids)).toEqual(
			new Set([...v12PartMetadata.keys()].filter((id) => !decorativeComponentIds.has(id)))
		);
		expect(V12_ATLAS_CATEGORIES.every((group) => group.count > 0)).toBe(true);
	});
	it('uses source subassembly names to separate real head castings from 96 seats and guides', () => {
		expect(V12_ATLAS_CATEGORIES.find((group) => group.id === 'heads')?.count).toBe(2);
		expect(V12_ATLAS_CATEGORIES.find((group) => group.id === 'seats-guides')?.count).toBe(96);
		expect(v12TaxonomyByComponent.get('v12-0666')?.id).toBe('heads');
		expect(v12TaxonomyByComponent.get('v12-0667')?.id).toBe('seats-guides');
	});
	it('distinguishes eight actual turbo rotors from housings and clamps by the terminal assembly name', () => {
		expect(V12_ATLAS_CATEGORIES.find((group) => group.id === 'turbo-rotors')?.count).toBe(8);
		expect(V12_ATLAS_CATEGORIES.find((group) => group.id === 'turbo-housings')?.count).toBe(16);
		expect(v12TaxonomyByComponent.get('v12-0799')?.id).toBe('turbo-rotors');
		expect(v12TaxonomyByComponent.get('v12-0801')?.id).toBe('turbo-housings');
	});
	it('keeps chain links, drive wheels and tensioners distinct without inventing new components', () => {
		expect(V12_ATLAS_CATEGORIES.find((group) => group.id === 'chains')?.count).toBe(320);
		expect(V12_ATLAS_CATEGORIES.find((group) => group.id === 'sprockets')?.count).toBe(8);
		expect(V12_ATLAS_CATEGORIES.find((group) => group.id === 'tensioners')?.count).toBe(6);
	});
	it('keeps unclassified geometry honest and excludes decorative words from the mechanical atlas', () => {
		expect(V12_ATLAS_CATEGORIES.find((group) => group.id === 'unclassified')?.componentIds).toEqual(
			['v12-0001', 'v12-0002']
		);
		expect(V12_ATLAS_CATEGORIES.find((group) => group.id === 'covers')?.count).toBe(7);
		expect(getV12TaxonomyGroup({ role: 'unknown', path: '/unlabelled' }).id).toBe('unclassified');
	});
	it('finds a category by its engineering terms or exact source identity', () => {
		expect(searchV12AtlasCategories('connecting rod').map((group) => group.id)).toEqual(['rods']);
		expect(searchV12AtlasCategories('v12-1253').map((group) => group.id)).toEqual([
			'valves-tappets'
		]);
		expect(searchV12AtlasCategories('')).toHaveLength(22);
	});
});
