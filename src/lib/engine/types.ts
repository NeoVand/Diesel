import type { LabAction } from './lab-state';

export type PartId =
	'block' | 'heads' | 'turbo' | 'air' | 'cooling' | 'fuel' | 'exhaust' | 'flywheel' | 'accessories';

export type LegacySceneAction =
	| { type: 'select'; part: PartId }
	| { type: 'explode' | 'isolate'; value: boolean }
	| { type: 'view'; value: 'perspective' | 'front' | 'side' | 'top' }
	| { type: 'load'; value: number }
	| { type: 'reset' };

export type SceneAction = LegacySceneAction | LabAction;

export interface Source {
	id: string;
	title: string;
	url: string;
}

export interface EnginePart {
	id: PartId;
	name: string;
	subtitle: string;
	description: string;
	principle: string;
	/** Display finish only: no verified production alloy or physical property. */
	material: string;
	metrics: { label: string; value: string }[];
	sources: Source[];
	narration: string;
}

export interface TutorialStep {
	title: string;
	body: string;
	part: PartId;
	explode: boolean;
}

export interface Tutorial {
	id: string;
	title: string;
	subtitle: string;
	duration: string;
	steps: TutorialStep[];
}

export interface PerformancePoint {
	loadPercent: number;
	electricalKW: number;
	brakeKW: number;
	bsfc: number;
	fuelLh: number;
	manifoldC: number;
	manifoldPressureKPaAsPrinted: number;
	airM3min: number;
	exhaustManifoldC: number;
	exhaustC: number;
	exhaustM3min: number;
	jacketHeatKW: number;
	atmosphereHeatKW: number;
	exhaustHeatKW: number;
	oilCoolerHeatKW: number;
}

export interface OperatingPoint extends PerformancePoint {
	rpm: number;
	frequencyHz: number;
	torqueNm: number;
	fuelThermalKW: number;
	/** Electrical output / fuel LHV thermal input. */
	efficiencyPercent: number;
	/** Reported engine brake output / fuel LHV thermal input. */
	brakeEfficiencyPercent: number;
	evidence: 'reported' | 'interpolated';
	sourceId: 'PERF005';
	performanceNumber: 'EM1898-00';
	pressureReference: 'unresolved';
}
