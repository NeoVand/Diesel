import manifest from '../../../static/models/v12-review.manifest.json';
import motion from './v12-motion-datums.json';
import timing from './v12-timing-datums.json';
import correctedTiming from './v12-corrected-timing.json';
import timingMounts from './v12-timing-mounts.json';
import turbo from './v12-turbo-datums.json';
import attachments from './v12-motion-attachments.json';
import valvetrain from './v12-valvetrain-datums.json';
import { decorativeComponentIds } from './definition';

export type V12MotionKind = 'fixed' | 'rigid' | 'deforming' | 'unresolved';
export type V12MotionRig = 'none' | 'cranktrain' | 'timing' | 'valvetrain' | 'turbo';
export interface V12MotionBinding {
	componentId: string;
	sourcePath: string;
	sourceRole: string;
	motion: V12MotionKind;
	rig: V12MotionRig;
	ownerId: string | null;
	memberRole: string;
	geometry: 'source' | 'source-with-derived-correction' | 'derived-replacement';
	evidence: string;
	confidence: 'measured' | 'inferred' | 'unresolved';
	nativeCorrectionMm?: readonly number[];
}

type SourcePart = Pick<(typeof manifest.parts)[number], 'id' | 'role' | 'sourcePath'>;
type Ownership = Omit<V12MotionBinding, 'componentId' | 'sourcePath' | 'sourceRole'>;
const bindings = new Map<string, Ownership>();
function assign(id: string, ownership: Ownership) {
	if (bindings.has(id)) throw new Error(`Duplicate V12 motion ownership: ${id}`);
	bindings.set(id, ownership);
}
function rigid(
	rig: V12MotionRig,
	ownerId: string,
	memberRole: string,
	evidence: string
): Ownership {
	return {
		motion: 'rigid',
		rig,
		ownerId,
		memberRole,
		geometry: 'source',
		evidence,
		confidence: 'measured'
	};
}
function fixed(memberRole: string, evidence: string): Ownership {
	return {
		motion: 'fixed',
		rig: 'none',
		ownerId: null,
		memberRole,
		geometry: 'source',
		evidence,
		confidence: 'inferred'
	};
}

// The crank sprocket occurs in both measurement datasets; timing owns it exactly once.
const correctedWheelIds = new Set(correctedTiming.wheelCorrections.map((wheel) => wheel.id));
for (const shaft of timing.shafts) {
	for (const id of shaft.componentIds) {
		const isCam = id in valvetrain.camCrankOffsetsDeg;
		const correction = isCam
			? ' Derived teaching phase: whole-cam clocking and rear-half lobe reindex preserve source lobe shape; original source remains available.'
			: correctedWheelIds.has(id)
				? ' Derived outer tooth-ring pitch/index correction; original source remains available.'
				: '';
		assign(id, {
			...rigid(
				'timing',
				shaft.id,
				isCam ? 'camshaft' : 'shaft or sprocket',
				shaft.evidence + correction
			),
			geometry: correction ? 'source-with-derived-correction' : 'source',
			confidence: 'inferred'
		});
	}
}
for (const guide of correctedTiming.guideCorrections) {
	assign(guide.id, {
		...fixed('stationary chain guide/tensioner support', guide.scope),
		geometry: 'source-with-derived-correction',
		nativeCorrectionMm: guide.nativeCorrectionMm
	});
}
for (const id of motion.crankshaftIds) {
	if (!bindings.has(id))
		assign(id, rigid('cranktrain', 'crank', 'crankshaft or flywheel', motion.provenance));
}
for (const cylinder of motion.cylinders) {
	assign(
		cylinder.pistonId,
		rigid(
			'cranktrain',
			`piston:${cylinder.pistonId}`,
			'piston',
			'Native piston pin, bore axis and measured slider-crank closure.'
		)
	);
	assign(
		cylinder.rodId,
		rigid(
			'cranktrain',
			`rod:${cylinder.rodId}`,
			'connecting rod',
			'Native big-end and piston-pin centers; fixed source rod length.'
		)
	);
}
for (const loop of timing.chainLoops) {
	for (const link of loop.links) {
		assign(link.componentId, {
			...rigid(
				'timing',
				`chain:${loop.id}`,
				'chain link',
				'Native link pin axes; rigid links carried by corrected closed-chain constraint solve. Source-path and pin residuals retained in timing audit.'
			),
			geometry: 'source-with-derived-correction'
		});
	}
}
for (const cover of attachments.camCovers) {
	assign(cover.componentId, {
		...rigid('timing', cover.ownerId, 'rotating cam sprocket cover', cover.evidence),
		geometry: cover.nativeCorrectionMm.some((v) => v !== 0)
			? 'source-with-derived-correction'
			: 'source',
		confidence: 'inferred',
		nativeCorrectionMm: cover.nativeCorrectionMm
	});
}
for (const shaft of turbo.shafts) {
	for (const id of shaft.componentIds) {
		assign(id, {
			...rigid(
				'turbo',
				shaft.id,
				id === shaft.compressorId ? 'compressor rotor' : 'turbine rotor and shaft',
				'Native compressor bore and turbine shaft are coaxial. Rigid coupling inferred; shaft speed and operating direction illustrative, independent of crank.'
			),
			confidence: 'inferred'
		});
	}
	for (const id of shaft.fixedHousingIds)
		assign(
			id,
			fixed(
				'turbo housing or clamp',
				'Named source compressor/turbine/bearing housings and V-band clamp remain fixed around the measured rotating shaft.'
			)
		);
}
for (const collector of attachments.chargeAirCollectors) {
	assign(collector.componentId, fixed(collector.derivedLabel, collector.evidence));
}
for (const group of attachments.fixedFastenerGroups) {
	for (const id of group.componentIds)
		assign(id, fixed('stationary mounting fastener', `${group.evidence} ${group.sourceGroup}`));
}
for (const valve of valvetrain.valves) {
	for (const [id, memberRole] of [
		[valve.valveId, 'poppet valve'],
		[valve.tappetId, 'cam follower']
	] as const) {
		assign(id, {
			...rigid(
				'valvetrain',
				`valve:${valve.valveId}`,
				memberRole,
				'Native seat/guide/follower axis and measured cam-contact profile; explicit source-placement/stem correction. Gas-cycle phasing is not authenticated.'
			),
			geometry: 'source-with-derived-correction'
		});
	}
	for (const coil of valve.spring.parts) {
		assign(coil.id, {
			motion: 'deforming',
			rig: 'valvetrain',
			ownerId: `spring:${valve.valveId}`,
			memberRole: 'source helical spring segment',
			geometry: 'derived-replacement',
			confidence: 'inferred',
			evidence:
				'Seven purchased coil segments belong to one spring. A continuous derived helix preserves native spring axis, radius and fixed support; wire diameter is fixed while pitch changes. Source fragments are not rigid-translated or scaled as independent springs.'
		});
	}
}

const fixedRoles: Readonly<Record<string, string>> = {
	block: 'stationary cylinder block',
	liner: 'stationary cylinder liner',
	sump: 'stationary oil sump',
	head: 'stationary head, seat ring or valve guide',
	bearings: 'stationary shaft bearing support',
	intake: 'stationary intake duct',
	exhaust: 'stationary exhaust duct',
	fuel: 'stationary injector or glow-plug source body; internal needles are not separate source bodies',
	cooling: 'stationary coolant component'
};

// Rest geometry and motion ownership are separate: repaired stationary supports
// remain fixed, while the corrected crowns keep their original cranktrain poses.
const clearanceEvidence = new Map<string, string>([
	...motion.cylinders.map(
		(cylinder) =>
			[
				cylinder.pistonId,
				'Derived native crown trim to 38.5 mm above the original pin; skirt, ring grooves, pin and rigid transforms retained. This changes clearance volume. See docs/V12_CLEARANCE_CORRECTIONS.md.'
			] as const
	),
	[
		'v12-0665',
		'Derived native block with ten finite lower-bore reliefs and sixteen relocated timing-mount pad/bore interfaces. Main bore axes and bearing geometry retained; local mounting surfaces explicitly changed. See docs/V12_CLEARANCE_CORRECTIONS.md and docs/V12_TIMING_MOUNT_RECONCILIATION.md.'
	],
	...['v12-0666', 'v12-0715'].map(
		(id) =>
			[
				id,
				'Derived native head with three local guide-support pad/bore relocations; negative-bank support pads extend 8 mm to the corrected guide backs. Valve, seat and chamber ownership remains fixed. See docs/V12_TIMING_MOUNT_RECONCILIATION.md.'
			] as const
	),
	[
		'v12-0317',
		'Derived native timing cap: 22 coaxial shaft/counterbore relocations, local support-post shortening and two guide-clearance pockets. Original source remains available. See docs/V12_TIMING_MOUNT_RECONCILIATION.md.'
	]
]);
const guideScrewCorrections = new Map(
	timingMounts.guides.flatMap((guide) =>
		guide.mounts.map((mount) => [mount.fastenerId, guide] as const)
	)
);

/** Explicit fallback is unresolved, never silently fixed or omitted. Decorative text is separate. */
export function buildV12MotionInventory(parts: readonly SourcePart[]): readonly V12MotionBinding[] {
	const seen = new Set<string>();
	return parts
		.filter((part) => !decorativeComponentIds.has(part.id))
		.map((part) => {
			if (seen.has(part.id)) throw new Error(`Duplicate source body: ${part.id}`);
			seen.add(part.id);
			let binding = bindings.get(part.id);
			if (!binding && fixedRoles[part.role]) {
				binding = fixed(
					fixedRoles[part.role],
					'Source role and named native subassembly establish stationary support/duct ownership; no separate internal moving members claimed.'
				);
			}
			if (!binding && part.role === 'covers' && /\/(cam cap|chain cap):/.test(part.sourcePath)) {
				binding = fixed(
					'stationary cam or timing enclosure',
					'Source enclosure body; rotating cam-sprocket covers are separately assigned by measured bolt-circle axis.'
				);
			}
			if (
				!binding &&
				part.role === 'timing' &&
				/\/chain tension(er)? [AB]:/.test(part.sourcePath)
			) {
				binding = fixed(
					'stationary chain guide/tensioner support',
					'Source guide support held at rest; tensioner compliance or actuator travel is not modeled.'
				);
			}
			binding ??= {
				motion: 'unresolved',
				rig: 'none',
				ownerId: null,
				memberRole: 'unresolved source body',
				geometry: 'source',
				confidence: 'unresolved',
				evidence:
					'No audited binding or fixed-body rule matches. Preserve the body and report it; do not invent motion.'
			};
			const clearance = clearanceEvidence.get(part.id);
			const guide = guideScrewCorrections.get(part.id);
			if (clearance || guide) {
				binding = {
					...binding,
					geometry: 'source-with-derived-correction',
					evidence: `${binding.evidence} ${
						clearance ??
						`Fixed mounting screw follows the native-axis rest translation of guide ${guide!.guideId}; original 47 mm source length and scale retained. See docs/V12_TIMING_MOUNT_RECONCILIATION.md.`
					}`,
					...(guide ? { nativeCorrectionMm: guide.nativeCorrectionMm } : {})
				};
			}
			return Object.freeze({
				componentId: part.id,
				sourcePath: part.sourcePath,
				sourceRole: part.role,
				...binding
			});
		});
}

export const V12_MOTION_INVENTORY = buildV12MotionInventory(manifest.parts);
export const V12_MOTION_BY_COMPONENT: ReadonlyMap<string, V12MotionBinding> = new Map(
	V12_MOTION_INVENTORY.map((item) => [item.componentId, item])
);
export const V12_DERIVED_MOTION_BINDINGS = valvetrain.valves.map((valve) => ({
	componentId: `derived-retainer-${valve.valveId}`,
	ownerId: `valve:${valve.valveId}`,
	motion: 'rigid' as const,
	rig: 'valvetrain' as const,
	kind: 'derived-retainer' as const,
	evidence:
		'Separate teaching-rig retainer, attached to the measured valve axis; absent as a separately identified purchased body.'
}));
export const V12_MOTION_INVENTORY_SUMMARY = Object.freeze({
	sourceBodies: manifest.parts.length,
	decorativeBodies: decorativeComponentIds.size,
	mechanicalBodies: V12_MOTION_INVENTORY.length,
	rigid: V12_MOTION_INVENTORY.filter((item) => item.motion === 'rigid').length,
	deforming: V12_MOTION_INVENTORY.filter((item) => item.motion === 'deforming').length,
	fixed: V12_MOTION_INVENTORY.filter((item) => item.motion === 'fixed').length,
	unresolved: V12_MOTION_INVENTORY.filter((item) => item.motion === 'unresolved').map(
		(item) => item.componentId
	),
	generatedSpringAssemblies: valvetrain.valves.length,
	generatedRetainers: V12_DERIVED_MOTION_BINDINGS.length,
	scope:
		'Ownership of every source mechanical body; this inventory does not certify clearances, thermodynamics, loads or manufacturing feasibility.'
});
