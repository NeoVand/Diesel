import * as THREE from 'three';
import datums from '../engine/v12-timing-datums.json';
import { v12NativeToDisplay } from '../engine/v12-kinematics';

export const V12_TIMING_DATUMS = datums;
export type V12TimingLoop = (typeof datums.chainLoops)[number];

const TAU = 2 * Math.PI;
const modulo = (value: number, period: number) => ((value % period) + period) % period;
const shortestAngle = (value: number) => modulo(value + Math.PI, TAU) - Math.PI;

function cubic(a: number, b: number, c: number, d: number, t: number): number {
	return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}

interface LinkFrame {
	x: number;
	y: number;
	angle: number;
}

/** One identified link's return period; it is generally NOT the 720° engine cycle. */
export function timingChainPeriodDeg(loop: V12TimingLoop): number {
	return (360 * loop.links.length) / (loop.driverTeeth * Math.abs(loop.driverCrankRatio));
}

/** Source pose interpolation only. This does not solve hinge, guide, or tooth-contact constraints. */
export function sampleTimingLinkFrame(
	loop: V12TimingLoop,
	linkCoordinate: number,
	out: LinkFrame = { x: 0, y: 0, angle: 0 }
): LinkFrame {
	const count = loop.links.length;
	const coordinate = modulo(linkCoordinate, count);
	const index = Math.floor(coordinate);
	const t = coordinate - index;
	const a = loop.links[(index + count - 1) % count];
	const b = loop.links[index];
	const c = loop.links[(index + 1) % count];
	const d = loop.links[(index + 2) % count];
	const bAngle = Math.atan2(b.tangent[1], b.tangent[0]);
	const aAngle = bAngle + shortestAngle(Math.atan2(a.tangent[1], a.tangent[0]) - bAngle);
	const cAngle = bAngle + shortestAngle(Math.atan2(c.tangent[1], c.tangent[0]) - bAngle);
	const dAngle = cAngle + shortestAngle(Math.atan2(d.tangent[1], d.tangent[0]) - cAngle);
	out.x = cubic(a.centerMm[0], b.centerMm[0], c.centerMm[0], d.centerMm[0], t);
	out.y = cubic(a.centerMm[1], b.centerMm[1], c.centerMm[1], d.centerMm[1], t);
	out.angle = cubic(aAngle, bAngle, cAngle, dAngle, t);
	return out;
}

/**
 * Audit-only prototype. Deliberately not imported by EngineStudio: the purchased chain already has
 * open hinges and mismatched upper-stage roller-seat pitch. A smooth picture cannot validate it.
 *
 * This transports the original rigid meshes without replacing or scaling any geometry. Native
 * source frames are reproduced at integer link advances. Catmull–Rom interpolation supplies C1
 * continuity between them; closure/contact must be measured independently, never assumed.
 * Pass an unwrapped crank angle: wrapping at 720° would teleport identified chain links.
 */
export class V12TimingPrototype {
	private readonly matrices = new Map<string, THREE.Matrix4>();
	private readonly shafts = datums.shafts.map((shaft) => ({
		...shaft,
		pivot: new THREE.Vector3(...v12NativeToDisplay(shaft.pivotMm)),
		matrix: new THREE.Matrix4()
	}));
	private readonly loops = datums.chainLoops.map((loop) => ({
		loop,
		links: loop.links.map((link) => ({
			...link,
			origin: new THREE.Vector3(...v12NativeToDisplay(link.centerMm)),
			angle: Math.atan2(link.tangent[1], link.tangent[0]),
			matrix: new THREE.Matrix4()
		}))
	}));
	private readonly rotation = new THREE.Matrix4();
	private readonly translation = new THREE.Matrix4();
	private readonly frame: LinkFrame = { x: 0, y: 0, angle: 0 };
	private phase = Number.NaN;

	constructor() {
		for (const shaft of this.shafts) {
			for (const id of shaft.componentIds) this.matrices.set(id, shaft.matrix);
		}
		for (const { links } of this.loops) {
			for (const link of links) this.matrices.set(link.componentId, link.matrix);
		}
	}

	/** Reused matrices; copy before adding scene layout/explosion transforms. */
	matricesForPhase(unwrappedCrankDeg: number): ReadonlyMap<string, THREE.Matrix4> {
		if (!Number.isFinite(unwrappedCrankDeg)) throw new RangeError('Drive angle must be finite.');
		if (unwrappedCrankDeg === this.phase) return this.matrices;
		this.phase = unwrappedCrankDeg;
		for (const shaft of this.shafts) {
			const degrees = modulo(unwrappedCrankDeg * shaft.crankRatio, 360);
			if (degrees === 0) {
				shaft.matrix.identity();
				continue;
			}
			shaft.matrix.makeTranslation(shaft.pivot.x, shaft.pivot.y, shaft.pivot.z);
			this.rotation.makeRotationX((-degrees * Math.PI) / 180);
			shaft.matrix.multiply(this.rotation);
			this.translation.makeTranslation(-shaft.pivot.x, -shaft.pivot.y, -shaft.pivot.z);
			shaft.matrix.multiply(this.translation);
		}
		for (const { loop, links } of this.loops) {
			const period = timingChainPeriodDeg(loop);
			const phase = modulo(unwrappedCrankDeg, period);
			if (phase === 0) {
				for (const link of links) link.matrix.identity();
				continue;
			}
			const advance = (phase / 360) * loop.driverTeeth * loop.driverCrankRatio * loop.direction;
			for (let i = 0; i < links.length; i++) {
				const link = links[i];
				sampleTimingLinkFrame(loop, i + advance, this.frame);
				const target = v12NativeToDisplay([this.frame.x, this.frame.y, link.centerMm[2]]);
				link.matrix.makeTranslation(...target);
				this.rotation.makeRotationX(this.frame.angle - link.angle);
				link.matrix.multiply(this.rotation);
				this.translation.makeTranslation(-link.origin.x, -link.origin.y, -link.origin.z);
				link.matrix.multiply(this.translation);
			}
		}
		return this.matrices;
	}
}
