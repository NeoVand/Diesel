import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StructuralResult } from '$lib/design/structural';

/** The surface node arrays supplied by the solid solver, in rod-local mm / MPa. */
export type StructuralSurfaceData = Pick<
	StructuralResult['surface'],
	'positionsMm' | 'triangles' | 'displacementMm' | 'vonMisesMpa'
>;

export type StructuralField = 'material' | 'stress' | 'displacement';
export interface StructuralProbe {
	analysisHash: string;
	/** Undeformed rod-local coordinates, not world coordinates or amplified geometry. */
	positionMm: [number, number, number];
	displacementMm: [number, number, number];
	/** Norm of the interpolated displacement vector, without visual amplification. */
	displacementMagnitudeMm: number;
	/** Interpolated nodal magnitudes, exactly the scalar used by the displayed contour. */
	displayedDisplacementMagnitudeMm: number;
	/** Barycentric interpolation of the recovered nodal surface field, not element stress. */
	stressMpa: number;
	fieldProvenance: 'Recovered nodal surface field';
}
export interface StructuralDisplay {
	enabled: boolean;
	field: StructuralField;
	/** Visual amplification only. The result vectors and reported values remain unchanged. */
	deformationScale: number;
	showUndeformed: boolean;
	showMesh: boolean;
	showBoundaryConditions: boolean;
	/** Omit to use the actual largest supplied nodal value, without percentile clipping. */
	fieldMaximum?: number;
}

export const DEFAULT_STRUCTURAL_DISPLAY: Readonly<StructuralDisplay> = Object.freeze({
	enabled: true,
	field: 'stress',
	deformationScale: 1,
	showUndeformed: true,
	showMesh: false,
	showBoundaryConditions: true
});

export const STRUCTURAL_COLORS = Object.freeze({
	cool: '#4b9dda',
	mid: '#ecd18d',
	hot: '#f1744f'
});

/** Linear interpolation of the recovered scalar precedes this fragment colormap. */
export const STRUCTURAL_FIELD_FRAGMENT = `
if (uStructuralMode > 0.5) {
	float fieldValue = uStructuralMode < 1.5 ? vStructuralStress : vStructuralDisplacement;
	float fraction = clamp(fieldValue / max(uStructuralMaximum, 1e-12), 0.0, 1.0);
	diffuseColor.rgb = fraction < 0.5
		? mix(uStructuralCool, uStructuralMid, fraction * 2.0)
		: mix(uStructuralMid, uStructuralHot, (fraction - 0.5) * 2.0);
}
`;

export function structuralFieldColor(value: number, maximum: number): THREE.Color {
	const fraction = Math.max(0, Math.min(1, value / Math.max(1e-12, maximum)));
	return fraction < 0.5
		? new THREE.Color(STRUCTURAL_COLORS.cool).lerp(
				new THREE.Color(STRUCTURAL_COLORS.mid),
				fraction * 2
			)
		: new THREE.Color(STRUCTURAL_COLORS.mid).lerp(
				new THREE.Color(STRUCTURAL_COLORS.hot),
				(fraction - 0.5) * 2
			);
}

export function validateStructuralSurface(surface: StructuralSurfaceData): void {
	const count = surface.positionsMm.length / 3;
	if (!Number.isInteger(count) || count < 3 || count > 2_000_000)
		throw new RangeError('The structural surface must contain a bounded array of XYZ nodes.');
	if (
		surface.displacementMm.length !== count * 3 ||
		surface.vonMisesMpa.length !== count ||
		surface.triangles.length < 3 ||
		surface.triangles.length % 3 !== 0 ||
		surface.triangles.length > 12_000_000
	)
		throw new RangeError('Structural surface fields must match its node and triangle counts.');
	for (const values of [surface.positionsMm, surface.displacementMm, surface.vonMisesMpa])
		if (!values.every(Number.isFinite))
			throw new RangeError('Structural surface fields must be finite.');
	if (surface.vonMisesMpa.some((value) => value < 0))
		throw new RangeError('Von Mises stress cannot be negative.');
	if (surface.triangles.some((index) => !Number.isInteger(index) || index < 0 || index >= count))
		throw new RangeError('A structural surface triangle references a missing node.');
}

/** All result attributes are copied. Rendering never mutates the authoritative solve. */
export function createStructuralGeometry(surface: StructuralSurfaceData): THREE.BufferGeometry {
	validateStructuralSurface(surface);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positionsMm, 3));
	geometry.setAttribute(
		'referencePosition',
		new THREE.Float32BufferAttribute(surface.positionsMm, 3)
	);
	geometry.setAttribute(
		'resultDisplacement',
		new THREE.Float32BufferAttribute(surface.displacementMm, 3)
	);
	geometry.setAttribute('resultStress', new THREE.Float32BufferAttribute(surface.vonMisesMpa, 1));
	const magnitude = new Float32Array(surface.vonMisesMpa.length);
	for (let i = 0; i < magnitude.length; i++)
		magnitude[i] = Math.hypot(...surface.displacementMm.slice(i * 3, i * 3 + 3));
	geometry.setAttribute('resultMagnitude', new THREE.BufferAttribute(magnitude, 1));
	geometry.setIndex([...surface.triangles]);
	// Duplicate crease vertices while retaining a one-to-one mapping of every result attribute.
	const result = toCreasedNormals(geometry, Math.PI / 5);
	geometry.dispose();
	result.computeBoundingBox();
	result.computeBoundingSphere();
	return result;
}

export function deformStructuralGeometry(geometry: THREE.BufferGeometry, scale: number): void {
	if (!Number.isFinite(scale) || scale < 0 || scale > 100_000)
		throw new RangeError('Choose a finite, nonnegative deformation amplification up to 100000.');
	const base = geometry.getAttribute('referencePosition');
	const displacement = geometry.getAttribute('resultDisplacement');
	const position = geometry.getAttribute('position') as THREE.BufferAttribute;
	if (!base || !displacement || !position)
		throw new Error('The surface is missing its structural reference attributes.');
	for (let i = 0; i < position.count; i++)
		position.setXYZ(
			i,
			base.getX(i) + displacement.getX(i) * scale,
			base.getY(i) + displacement.getY(i) * scale,
			base.getZ(i) + displacement.getZ(i) * scale
		);
	position.needsUpdate = true;
	toCreasedNormals(geometry, Math.PI / 5);
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
}

export function structuralSurfaceLimits(surface: StructuralSurfaceData) {
	let maximumStressMpa = 0;
	let maximumDisplacementMm = 0;
	for (let i = 0; i < surface.vonMisesMpa.length; i++) {
		maximumStressMpa = Math.max(maximumStressMpa, surface.vonMisesMpa[i]);
		maximumDisplacementMm = Math.max(
			maximumDisplacementMm,
			Math.hypot(...surface.displacementMm.slice(i * 3, i * 3 + 3))
		);
	}
	return { maximumStressMpa, maximumDisplacementMm };
}

/**
 * Interpolate the same per-vertex attributes used by the shader at a ray/triangle hit.
 * Barycentric weights are calculated on the displayed (possibly amplified) triangle;
 * those weights map back to the original nodes. Magnitude of an interpolated vector
 * and interpolation of nodal magnitudes are intentionally reported separately.
 */
export function probeStructuralGeometry(
	geometry: THREE.BufferGeometry,
	faceIndex: number,
	displayedPosition: THREE.Vector3,
	analysisHash: string
): StructuralProbe | null {
	if (!Number.isInteger(faceIndex) || faceIndex < 0) return null;
	const positions = geometry.getAttribute('position');
	const reference = geometry.getAttribute('referencePosition');
	const displacement = geometry.getAttribute('resultDisplacement');
	const stress = geometry.getAttribute('resultStress');
	const magnitude = geometry.getAttribute('resultMagnitude');
	if (!positions || !reference || !displacement || !stress || !magnitude) return null;
	const indices = [0, 1, 2].map((offset) => {
		const index = faceIndex * 3 + offset;
		return geometry.index ? geometry.index.getX(index) : index;
	});
	if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= positions.count))
		return null;
	const [a, b, c] = indices.map((index) =>
		new THREE.Vector3().fromBufferAttribute(positions, index)
	);
	const weights = THREE.Triangle.getBarycoord(displayedPosition, a, b, c, new THREE.Vector3());
	if (!weights || weights.toArray().some((value) => !Number.isFinite(value) || value < -1e-5))
		return null;
	const point = new THREE.Vector3();
	const delta = new THREE.Vector3();
	let stressMpa = 0;
	let displayedDisplacementMagnitudeMm = 0;
	indices.forEach((index, i) => {
		const weight = weights.getComponent(i);
		point.addScaledVector(new THREE.Vector3().fromBufferAttribute(reference, index), weight);
		delta.addScaledVector(new THREE.Vector3().fromBufferAttribute(displacement, index), weight);
		stressMpa += stress.getX(index) * weight;
		displayedDisplacementMagnitudeMm += magnitude.getX(index) * weight;
	});
	return {
		analysisHash,
		positionMm: point.toArray() as [number, number, number],
		displacementMm: delta.toArray() as [number, number, number],
		displacementMagnitudeMm: delta.length(),
		displayedDisplacementMagnitudeMm,
		stressMpa,
		fieldProvenance: 'Recovered nodal surface field'
	};
}
