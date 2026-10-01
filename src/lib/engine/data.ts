import { engineDefinition } from './definition';
import type { EnginePart, Source, Tutorial } from './types';

export const engineSpecs = {
	model: 'Generic V12 diesel concept',
	configuration: 'V12 · four-stroke · quad turbo',
	...engineDefinition.geometry,
	geometryStatus: 'Purchased native internals with documented geometric corrections',
	calibrationLabel: 'Geometry study · performance calibration unavailable',
	serialStatus: 'Concept design; no production serial',
	engineControl: 'No authenticated controller calibration',
	performanceNumber: 'No matched performance map'
} as const;
export const sources: Source[] = engineDefinition.evidence.map((source) => ({ ...source }));
const geometry = sources.find((source) => source.id === 'V12_GEOMETRY')!,
	catalog = sources.find((source) => source.id === 'V12_CATALOG')!;
const part = (
	id: EnginePart['id'],
	name: string,
	subtitle: string,
	description: string,
	principle: string,
	metrics: EnginePart['metrics']
): EnginePart => ({
	id,
	name,
	subtitle,
	description,
	principle,
	metrics,
	material: 'Vendor appearance interpreted for display; production alloy unverified',
	sources: [geometry, catalog],
	narration: `${description} ${principle}`
});
export const parts: EnginePart[] = [
	part(
		'block',
		'Rotating assembly & structure',
		'Twelve cylinders. One crankshaft.',
		'The purchased design includes the cylinder block, twelve liners, pistons and connecting rods, bearings and a crankshaft. Measured 85 mm bore and 100 mm stroke give approximately 6.81 litres.',
		'Each piston transfers force through its connecting rod to a crank journal. The measured rod centers are 125 mm apart; the crank throw is 50 mm.',
		[
			{ label: 'Bore × stroke', value: '85 × 100 mm' },
			{ label: 'Displacement', value: '6.81 L · geometry-derived' },
			{ label: 'Bank angle', value: '60°' }
		]
	),
	part(
		'heads',
		'Cylinder heads & valve train',
		'Follow the actual modeled hardware',
		'Four native-derived cams drive 48 source valves and tappets against their actual seat and guide axes. Stem lengths and one tappet position are corrected; 48 spring assemblies deform beneath distinct derived retainers.',
		'Lift is computed from the actual cam profiles over finite tappet pads. Documented cam clocking and rear-lobe reindexing establish a four-stroke teaching sequence, with no authenticated production calibration.',
		[
			{ label: 'Camshafts', value: '4 · source-profile correction' },
			{ label: 'Valves', value: '48 · geometry-driven lift' },
			{ label: 'Calibration', value: 'Derived teaching cycle' }
		]
	),
	part(
		'turbo',
		'Turbochargers',
		'Four modeled turbo assemblies',
		'The design includes four turbocharger assemblies with distinct housing and rotor geometry. Their presence does not establish compressor maps, shaft speeds or rated output.',
		'Exhaust energy turns a turbine connected to an intake compressor. An explanation can relate these connected systems; highlighted hardware is not a turbo-performance prediction.',
		[
			{ label: 'Assemblies', value: '4 modeled' },
			{ label: 'Turbo maps', value: 'Not supplied' },
			{ label: 'Shaft speed', value: 'Not calibrated' }
		]
	),
	part(
		'air',
		'Intake system',
		'The route into the cylinders',
		'The source includes intake manifolds and duct components. Their geometry can be explored alongside the heads and turbo assemblies.',
		'Compressed intake air supplies oxygen for combustion. System highlighting identifies relevant source components; it does not measure gas velocity.',
		[
			{ label: 'Path', value: 'Geometry-based inspection' },
			{ label: 'Flow rate', value: 'Not calibrated' }
		]
	),
	part(
		'cooling',
		'Cooling hardware',
		'Heat transport, with clear limits',
		'Cooling-related source components are present, but the audit does not establish a complete pump, jacket and heat-exchanger circuit.',
		'Coolant carries heat away from engine surfaces. Any simplified circuit is a schematic explanation, not a CFD or thermal simulation.',
		[
			{ label: 'Passages', value: 'Coverage under review' },
			{ label: 'Heat rejection', value: 'No matched measurements' }
		]
	),
	part(
		'fuel',
		'Fuel & glow-plug assemblies',
		'Compression ignition, without a spark',
		'The source contains fuel-rail and injector assemblies and glow-plug geometry. Some repeated items are combined in a single source body, so source-body counts are not an individual parts catalog.',
		'Diesel fuel ignites in hot compressed air. Glow plugs assist starting; they are not spark plugs firing on every operating cycle. Injection and ignition cues use explicitly educational timing.',
		[
			{ label: 'Hardware', value: 'Rails, injectors, glow plugs' },
			{ label: 'Injection timing', value: 'Not calibrated' },
			{ label: 'Fuel consumption', value: 'No matched map' }
		]
	),
	part(
		'exhaust',
		'Exhaust system',
		'From cylinders to turbines',
		'The source exhaust components connect the cylinder banks with turbocharger hardware. Individual shapes retain their purchased provenance.',
		'Gas leaving an exhaust valve carries energy toward the turbine. System highlighting identifies relevant hardware, not measured temperatures or emissions.',
		[
			{ label: 'Geometry', value: 'Purchased manifold components' },
			{ label: 'Temperature', value: 'Not predicted' }
		]
	),
	part(
		'flywheel',
		'Flywheel & output',
		'Inertia at the crankshaft output',
		'The purchased assembly contains an actual flywheel. The native and display exports have been compared; inertia and production material properties are not supplied.',
		'A flywheel stores rotational energy and smooths speed changes. Shape alone does not establish calibrated inertia, rated speed or delivered power.',
		[
			{ label: 'Flywheel', value: 'Native geometry present' },
			{ label: 'Power rating', value: 'Not established' }
		]
	),
	part(
		'accessories',
		'Timing drive & hardware',
		'Explore assemblies before individual links',
		'Three closed loops move all 320 original chain-link bodies at unit scale. Derived tooth-ring and guide-placement corrections reconcile the measured shaft axes with the recovered rigid link pitch.',
		'The lower 30:30 stage drives the compound idler at crank speed. Upper 20:40 stages drive the cams at half speed. Geometric hinge closure and guide-envelope separation are checked; contact forces and timing-drive dynamics are not modeled.',
		[
			{ label: 'Timing detail', value: '320 rigid links · 3 closed loops' },
			{ label: 'Fasteners', value: '244 source bodies' },
			{ label: 'Assembly', value: 'Concept, not service procedure' }
		]
	)
];
export const tutorials: Tutorial[] = [
	{
		id: 'four-stroke',
		title: 'Inside the V12',
		subtitle: 'Explore construction and mechanical motion',
		duration: '3 min',
		steps: [
			{
				title: 'Begin with the source',
				body: 'This concept contains actual modeled internals. Its measured dimensions describe a compact 6.81-litre V12.',
				part: 'block',
				explode: false
			},
			{
				title: 'Follow the rotating assembly',
				body: 'Twelve rods link the pistons to the crankshaft. Explore their actual geometry and measured pin relationships.',
				part: 'block',
				explode: true
			},
			{
				title: 'Look beneath the covers',
				body: 'Four corrected native cams drive 48 valves and tappets. Their actual profiles control lift; springs compress with fixed wire diameter. The documented teaching cycle is distinct from production calibration.',
				part: 'heads',
				explode: true
			},
			{
				title: 'Follow the energy path',
				body: 'Intake, fuel and exhaust hardware support compression ignition. Explanatory cues are distinct from calibrated flow or combustion.',
				part: 'fuel',
				explode: false
			}
		]
	}
];
export function getPart(id: string | null | undefined): EnginePart | undefined {
	return parts.find((part) => part.id === id);
}
export const knowledgePack = [
	`ENGINE: ${engineDefinition.description} Native measured geometry: 12 cylinders, 60-degree banks, 85 mm bore, 100 mm stroke, 50 mm crank throw, 125 mm rod center distance, computed displacement ${engineDefinition.geometry.displacementL.toFixed(4)} L. These are source-design measurements, not authenticated production specifications.`,
	'SOURCE: 1,253 source mesh occurrences; 1,110 distinct native solids passed geometry checks. Source bodies sometimes combine repeated hardware. No claim that these counts equal every physical part needed to build a working engine. Cover lettering is hidden in the presentation; original files are preserved.',
	'MECHANICS: Global angle is referenced to the source crank pose. The corrected rig moves the crank, rods, pistons, timing wheels, 320 rigid chain links, four cams, 48 valves and 48 tappets; 48 springs deform. Actual source cam profiles define lift. Whole-cam indexing and rear-half lobe reindexing establish twelve derived compression events 60 degrees apart. Source firing order and injector calibration are not authenticated. Corrected stem lengths, one tappet axis, guide placement, tooth rings, piston crowns and selected block corners are documented adaptations. Original source evidence is preserved. Geometric acceptance does not establish operating force, thermal, wear or manufacturing limits.',
	'PERFORMANCE: No matched rated rpm, power, torque, fuel consumption, boost, compression ratio, emissions, thermal or acoustic calibration is supplied. Do not reuse any previous engine performance dataset. A separately declared air-standard cylinder case computes mass/internal energy, pressure, temperature, signed gas exchange and indicated work. It assumes 1800 rpm, 16:1 compression, 1.1 bar/320 K intake, 1.2 bar/650 K exhaust and 950 J heat per cylinder-cycle. These case outputs are not engine ratings, brake power, chemical combustion or calibrated fuel efficiency.',
	'PROCESSES: Air and exhaust tracers follow offline steady potential-flow solutions inside recovered native manifold volumes, with actual valve-open masks. Their visible speed is illustrative. Fuel uses reduced drag/evaporation parcels at measured nozzle tips, with an assumed eight-hole pattern and first-wall-contact retirement. The bounded emission/absorption volume is an illustrative spray-region mixing/heat envelope, not a spatial temperature field or reacting CFD. These passage/spray displays are not a coupled transient solution of the air-standard cylinder case.',
	'VISUALS: Assembly/explosion preserve source part scale. Parts atlas uses one common scale with presentation spacing. Geometry may contain real bores and cavities; closed solid walls do not mean a filled cylinder. Source material names describe appearances, not physical alloys or properties.',
	...engineDefinition.limitations,
	...parts.map(
		(part) => `PART ${part.id}: ${part.name}. ${part.description} Principle: ${part.principle}`
	),
	...sources.map((source) => `SOURCE ${source.id}: ${source.title}. ${source.url}`)
].join('\n\n');
export const ENGINE = engineSpecs;
export const PARTS = parts;
export const SOURCES = sources;
