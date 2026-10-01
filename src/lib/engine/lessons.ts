import type { LabAction } from './lab-state';
export interface EngineLesson {
	id: string;
	title: string;
	subtitle: string;
	duration: string;
	steps: LessonCue[];
}
export interface LessonCue {
	title: string;
	body: string;
	phase: string;
	actions: LabAction[];
	seconds: number;
}
export const engineLessons: EngineLesson[] = [
	{
		id: 'four-stroke',
		title: 'Inside the mechanism',
		subtitle: 'Actual parts, measured connections, one crankshaft.',
		duration: '90 SEC',
		steps: [
			{
				title: 'A complete view of the source',
				body: 'This purchased V12 concept contains modeled internal machinery. An 85 millimetre bore and 100 millimetre stroke imply 6.81 litres. The dimensions describe the design, not a certified production engine.',
				phase: 'THE SOURCE',
				seconds: 12,
				actions: [
					{ type: 'display', value: 'assembly' },
					{ type: 'reveal', value: 'complete' },
					{ type: 'explosion', value: 0 },
					{ type: 'running', value: false },
					{ type: 'flows', value: [] },
					{ type: 'select', id: 'block' }
				]
			},
			{
				title: 'Open the rotating assembly',
				body: 'The actual crankshaft, twelve connecting rods and pistons are now revealed. The source has a 50 millimetre crank throw and 125 millimetre rod centres. These measurements constrain the moving linkage.',
				phase: 'THE CONNECTIONS',
				seconds: 14,
				actions: [
					{ type: 'display', value: 'mechanism' },
					{ type: 'reveal', value: 'rotating' },
					{ type: 'select', id: 'v12-0661' },
					{ type: 'seek', value: 0 }
				]
			},
			{
				title: 'Follow one piston',
				body: 'A connecting rod joins its piston pin to a crank journal. The purchased crank pose provides angle zero. Corrected cam indexing assigns the compression stroke; it is a documented teaching sequence, not an authenticated firing order.',
				phase: 'THE PISTON',
				seconds: 14,
				actions: [
					{ type: 'display', value: 'cylinder' },
					{ type: 'reveal', value: 'rotating' },
					{ type: 'select', id: 'v12-0003' },
					{ type: 'focus', id: 'v12-0003' },
					{ type: 'seek', value: 90 }
				]
			},
			{
				title: 'See the connected motion',
				body: 'Run the connected mechanism slowly. Rigid rods and closed chain loops keep their pin relationships while four cams drive 48 valves and tappets. Geometry corrections and their clearance checks are documented separately from operating forces and combustion calibration.',
				phase: 'MECHANICAL PLAYBACK',
				seconds: 18,
				actions: [
					{ type: 'display', value: 'mechanism' },
					{ type: 'reveal', value: 'rotating' },
					{ type: 'select', id: null },
					{ type: 'fit' },
					{ type: 'playback', value: 0.02 },
					{ type: 'running', value: true }
				]
			},
			{
				title: 'Pause and inspect the valve train',
				body: 'Inspect the four native-derived camshafts and 48 valve stations. Actual lobe profiles determine lift; the source seats and guides establish the closed position. Springs change pitch with fixed wire diameter. Cam indexing, stem lengths and derived retainers are explicit corrections, without an OEM calibration claim.',
				phase: 'THE VALVE TRAIN',
				seconds: 14,
				actions: [
					{ type: 'running', value: false },
					{ type: 'display', value: 'assembly' },
					{ type: 'reveal', value: 'valvetrain' },
					{ type: 'select', id: 'heads' },
					{ type: 'fit' }
				]
			}
		]
	},
	{
		id: 'air-path',
		title: 'From air to power',
		subtitle: 'Understand the roles of air, fuel and exhaust.',
		duration: '70 SEC',
		steps: [
			{
				title: 'A turbo connects two energy paths',
				body: 'An exhaust turbine drives a compressor on the same shaft. This concept has four turbo assemblies. Their geometry does not supply compressor maps or a rated shaft speed.',
				phase: 'AIR SUPPLY',
				seconds: 14,
				actions: [
					{ type: 'display', value: 'assembly' },
					{ type: 'reveal', value: 'complete' },
					{ type: 'running', value: false },
					{ type: 'select', id: 'turbo' },
					{ type: 'flows', value: ['air'] }
				]
			},
			{
				title: 'Air enters through the intake hardware',
				body: 'The intake hardware leads toward the cylinder heads. System highlighting identifies the intake hardware; it does not measure air velocity, pressure or mass flow.',
				phase: 'INTAKE',
				seconds: 14,
				actions: [
					{ type: 'select', id: 'air' },
					{ type: 'reveal', value: 'covers' }
				]
			},
			{
				title: 'Diesel fuel ignites in compressed air',
				body: 'The source contains fuel rails, injectors and glow plugs. A diesel uses compression ignition. Glow plugs can assist starting; they do not spark on each operating cycle. Exact injection timing and fuel quantity are not supplied.',
				phase: 'FUEL',
				seconds: 18,
				actions: [
					{ type: 'select', id: 'fuel' },
					{ type: 'flows', value: ['fuel'] }
				]
			},
			{
				title: 'Exhaust carries energy to the turbine',
				body: 'Exhaust gas flows from the heads through the manifold and turbine path. This explains component relationships. It does not predict temperature, turbine response or emissions.',
				phase: 'EXHAUST',
				seconds: 14,
				actions: [
					{ type: 'select', id: 'exhaust' },
					{ type: 'flows', value: ['exhaust'] }
				]
			}
		]
	},
	{
		id: 'support-systems',
		title: 'What the geometry establishes',
		subtitle: 'Inspect the design and its evidence boundaries.',
		duration: '60 SEC',
		steps: [
			{
				title: 'The source is more than an exterior',
				body: 'The native audit found 1,110 distinct valid solids. The display contains 1,253 source mesh occurrences. Some bodies combine repeated pieces, and native validity alone does not prove full-cycle clearances.',
				phase: 'NATIVE GEOMETRY',
				seconds: 15,
				actions: [
					{ type: 'running', value: false },
					{ type: 'flows', value: [] },
					{ type: 'display', value: 'layout' },
					{ type: 'reveal', value: 'complete' },
					{ type: 'select', id: null },
					{ type: 'fit' }
				]
			},
			{
				title: 'Cooling hardware is not a complete thermal model',
				body: 'Cooling-related components are present, but a complete pump and passage network has not been established. No matched heat-rejection data is available for this concept.',
				phase: 'COOLING',
				seconds: 15,
				actions: [
					{ type: 'display', value: 'assembly' },
					{ type: 'select', id: 'cooling' },
					{ type: 'fit' }
				]
			},
			{
				title: 'Ask about the part in front of you',
				body: 'The guide can search the source catalog, isolate a part, move the section and restore a view. It observes the actual scene after each action. Numerical power, fuel and emissions predictions remain unavailable.',
				phase: 'EXPLORE WITH THE GUIDE',
				seconds: 15,
				actions: [
					{ type: 'reveal', value: 'complete' },
					{ type: 'select', id: null },
					{ type: 'flows', value: [] },
					{ type: 'fit' }
				]
			}
		]
	}
];
