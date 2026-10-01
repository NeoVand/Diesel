import * as THREE from 'three';
import { ROD_INTERFACES, type DesignParams } from '$lib/design/design-core';

/** Engine design coordinates and all geometry dimensions are millimetres. */
export type RodDimensions = Pick<
	DesignParams,
	'rodLengthMm' | 'rodWidthMm' | 'rodDepthMm' | 'webMm' | 'flangeMm'
>;

/** Add longitudinal field samples without changing the solid boundary. */
function sampleBeamFaces(input: THREE.BufferGeometry): THREE.BufferGeometry {
	const positions = input.getAttribute('position');
	const normals = input.getAttribute('normal');
	const points: number[] = [];
	const directions: number[] = [];
	type Vertex = { p: number[]; n: number[] };
	const midpoint = (a: Vertex, b: Vertex): Vertex => ({
		p: a.p.map((v, i) => (v + b.p[i]) / 2),
		n: a.n.map((v, i) => (v + b.n[i]) / 2)
	});
	const triangle = (a: Vertex, b: Vertex, c: Vertex, depth = 0) => {
		const edges = [Math.abs(a.p[1] - b.p[1]), Math.abs(b.p[1] - c.p[1]), Math.abs(c.p[1] - a.p[1])];
		const longest = Math.max(...edges);
		if (longest > 9 && depth < 7) {
			if (edges[0] === longest) {
				const mid = midpoint(a, b);
				triangle(a, mid, c, depth + 1);
				triangle(mid, b, c, depth + 1);
			} else if (edges[1] === longest) {
				const mid = midpoint(b, c);
				triangle(a, b, mid, depth + 1);
				triangle(a, mid, c, depth + 1);
			} else {
				const mid = midpoint(c, a);
				triangle(a, b, mid, depth + 1);
				triangle(mid, b, c, depth + 1);
			}
			return;
		}
		for (const vertex of [a, b, c]) {
			points.push(...vertex.p);
			directions.push(...vertex.n);
		}
	};
	for (let i = 0; i < positions.count; i += 3) {
		const v = (j: number): Vertex => ({
			p: [positions.getX(j), positions.getY(j), positions.getZ(j)],
			n: [normals.getX(j), normals.getY(j), normals.getZ(j)]
		});
		triangle(v(i), v(i + 1), v(i + 2));
	}
	const result = new THREE.BufferGeometry();
	result.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
	result.setAttribute('normal', new THREE.Float32BufferAttribute(directions, 3));
	input.dispose();
	return result;
}

/** Boundary of two eye discs joined by a rectangular shank; shared with the STEP generator. */
export function rodProfile(width: number, length: number): THREE.Shape {
	const { bigEndOuterRadiusMm: big, smallEndOuterRadiusMm: small } = ROD_INTERFACES;
	if (!(width > 0 && width < small * 2 && length > big + small)) {
		throw new RangeError('Rod profile dimensions cannot form this design family.');
	}
	const half = width / 2;
	const bigY = Math.sqrt(big * big - half * half);
	const smallY = Math.sqrt(small * small - half * half);
	const shape = new THREE.Shape();
	shape.moveTo(-half, bigY);
	shape.lineTo(-half, length - smallY);
	shape.absarc(0, length, small, Math.atan2(-smallY, -half), Math.atan2(-smallY, half), true);
	shape.lineTo(half, bigY);
	shape.absarc(0, 0, big, Math.atan2(bigY, half), Math.atan2(bigY, -half), true);
	shape.closePath();
	for (const [y, radius] of [
		[0, ROD_INTERFACES.bigEndInnerRadiusMm],
		[length, ROD_INTERFACES.smallEndInnerRadiusMm]
	]) {
		const hole = new THREE.Path();
		hole.absarc(0, y, radius, 0, Math.PI * 2, false);
		shape.holes.push(hole);
	}
	return shape;
}

/** Three contiguous solid layers: wide flanges, narrow web, and full depth bearing eyes. */
export function createRodGeometries(params: RodDimensions, segments = 72): THREE.BufferGeometry[] {
	const depth = params.rodDepthMm;
	const flange = params.flangeMm;
	if (!(depth > 2 * flange && flange > 0 && params.webMm < params.rodWidthMm)) {
		throw new RangeError('Rod depth and section thicknesses must define an open I section.');
	}
	const layer = (width: number, thickness: number, z: number) => {
		const geometry = new THREE.ExtrudeGeometry(rodProfile(width, params.rodLengthMm), {
			depth: thickness,
			bevelEnabled: false,
			curveSegments: segments,
			steps: 1
		});
		geometry.translate(0, 0, z);
		const sampled = sampleBeamFaces(geometry);
		sampled.computeBoundingBox();
		return sampled;
	};
	return [
		layer(params.rodWidthMm, flange, -depth / 2),
		layer(params.webMm, depth - 2 * flange, -depth / 2 + flange),
		layer(params.rodWidthMm, flange, depth / 2 - flange)
	];
}

export function ringGeometry(inner: number, outer: number, depth: number, segments = 64) {
	const shape = new THREE.Shape();
	shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
	const hole = new THREE.Path();
	hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
	shape.holes.push(hole);
	const geometry = new THREE.ExtrudeGeometry(shape, {
		depth,
		bevelEnabled: false,
		curveSegments: segments,
		steps: 1
	});
	geometry.translate(0, 0, -depth / 2);
	return geometry;
}

export type CrankTrainPose = {
	bank: number;
	station: number;
	axis: THREE.Vector3;
	pin: THREE.Vector3;
	piston: THREE.Vector3;
	rodRotation: THREE.Quaternion;
	journalAngle: number;
};

/** Authored six-throw arrangement. Geometric phases are not an asserted combustion sequence. */
export const DESIGN_THROW_PHASES = [0, 120, 240, 240, 120, 0];

export function normalizeCrankPhase(degrees: number): number {
	if (!Number.isFinite(degrees)) throw new RangeError('A finite crank phase is required.');
	return ((degrees % 360) + 360) % 360;
}

export function crankTrainPoses(
	params: Pick<DesignParams, 'boreMm' | 'strokeMm' | 'rodLengthMm' | 'rodDepthMm'>,
	phaseDegrees: number
): CrankTrainPose[] {
	const radius = params.strokeMm / 2;
	if (!(radius > 0 && params.rodLengthMm > radius)) throw new RangeError('Invalid slider crank.');
	const pitch = Math.max(params.boreMm + 15, 92);
	const poses: CrankTrainPose[] = [];
	for (let station = 0; station < 6; station++) {
		// The public phase is referenced to Bank A / station 1 bore TDC, matching the analysis plot.
		const angle =
			((normalizeCrankPhase(phaseDegrees) + DESIGN_THROW_PHASES[station] - 30) * Math.PI) / 180;
		for (let bank = 0; bank < 2; bank++) {
			const sign = bank ? 1 : -1;
			const axis = new THREE.Vector3(0, Math.cos(Math.PI / 6), sign * Math.sin(Math.PI / 6));
			const x = (station - 2.5) * pitch + sign * (params.rodDepthMm / 2 + 0.6);
			const pin = new THREE.Vector3(x, radius * Math.cos(angle), radius * Math.sin(angle));
			const axial = pin.dot(axis);
			const transverseSquared = pin.y * pin.y + pin.z * pin.z - axial * axial;
			const distance = axial + Math.sqrt(params.rodLengthMm ** 2 - transverseSquared);
			const piston = axis.clone().multiplyScalar(distance);
			piston.x = x;
			const yAxis = piston.clone().sub(pin).normalize();
			// +X in the operating model follows increasing crank angle from bore TDC.
			// Together with bore-up +Y, its right-handed bearing axis points along -world X.
			const zAxis = new THREE.Vector3(-1, 0, 0);
			const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
			const rodRotation = new THREE.Quaternion().setFromRotationMatrix(
				new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)
			);
			poses.push({ bank, station, axis, pin, piston, rodRotation, journalAngle: angle });
		}
	}
	return poses;
}
