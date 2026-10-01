import { engineSpecs } from './legacy-reference-specs';
import type { OperatingPoint, PerformancePoint } from './types';

/**
 * Nominal EM1898-00 data, PDS PERF005 pages 1–2, transcribed from the private
 * reference CSV. All points use 1800 rpm, standby duty and the same report revision.
 * exhaustC is STACK temperature; exhaustManifoldC is a separate measurement.
 * These channels must not be combined into an assumed closed thermal balance.
 */
export const performanceMap: readonly PerformancePoint[] = [
	{
		loadPercent: 10.0,
		electricalKW: 150.0,
		brakeKW: 232.4,
		bsfc: 269.4,
		fuelLh: 73.6,
		manifoldC: 39.6,
		manifoldPressureKPaAsPrinted: 24.7,
		airM3min: 50.5,
		exhaustManifoldC: 320.9,
		exhaustC: 282.5,
		exhaustM3min: 94.5,
		jacketHeatKW: 159.8,
		atmosphereHeatKW: 67.1,
		exhaustHeatKW: 307.2,
		oilCoolerHeatKW: 39.6
	},
	{
		loadPercent: 20.0,
		electricalKW: 300.0,
		brakeKW: 393.1,
		bsfc: 235.8,
		fuelLh: 109.0,
		manifoldC: 40.7,
		manifoldPressureKPaAsPrinted: 44.9,
		airM3min: 58.6,
		exhaustManifoldC: 401.4,
		exhaustC: 335.8,
		exhaustM3min: 121.3,
		jacketHeatKW: 209.2,
		atmosphereHeatKW: 75.6,
		exhaustHeatKW: 442.2,
		oilCoolerHeatKW: 58.7
	},
	{
		loadPercent: 25.0,
		electricalKW: 375.0,
		brakeKW: 471.4,
		bsfc: 228.4,
		fuelLh: 126.7,
		manifoldC: 41.2,
		manifoldPressureKPaAsPrinted: 57.2,
		airM3min: 63.5,
		exhaustManifoldC: 432.0,
		exhaustC: 351.6,
		exhaustM3min: 135.3,
		jacketHeatKW: 231.9,
		atmosphereHeatKW: 80.4,
		exhaustHeatKW: 508.2,
		oilCoolerHeatKW: 68.2
	},
	{
		loadPercent: 30.0,
		electricalKW: 450.0,
		brakeKW: 548.6,
		bsfc: 223.6,
		fuelLh: 144.3,
		manifoldC: 41.7,
		manifoldPressureKPaAsPrinted: 70.6,
		airM3min: 68.9,
		exhaustManifoldC: 457.8,
		exhaustC: 362.9,
		exhaustM3min: 149.5,
		jacketHeatKW: 253.7,
		atmosphereHeatKW: 85.1,
		exhaustHeatKW: 573.3,
		oilCoolerHeatKW: 77.7
	},
	{
		loadPercent: 40.0,
		electricalKW: 600.0,
		brakeKW: 701.3,
		bsfc: 218.3,
		fuelLh: 180.1,
		manifoldC: 42.4,
		manifoldPressureKPaAsPrinted: 101.4,
		airM3min: 81.2,
		exhaustManifoldC: 494.4,
		exhaustC: 372.3,
		exhaustM3min: 179.2,
		jacketHeatKW: 295.2,
		atmosphereHeatKW: 93.0,
		exhaustHeatKW: 701.2,
		oilCoolerHeatKW: 96.9
	},
	{
		loadPercent: 50.0,
		electricalKW: 750.0,
		brakeKW: 853.0,
		bsfc: 216.1,
		fuelLh: 216.9,
		manifoldC: 41.9,
		manifoldPressureKPaAsPrinted: 137.1,
		airM3min: 95.6,
		exhaustManifoldC: 517.6,
		exhaustC: 369.3,
		exhaustM3min: 210.6,
		jacketHeatKW: 335.1,
		atmosphereHeatKW: 97.8,
		exhaustHeatKW: 823.4,
		oilCoolerHeatKW: 116.7
	},
	{
		loadPercent: 60.0,
		electricalKW: 900.0,
		brakeKW: 1005.9,
		bsfc: 214.3,
		fuelLh: 253.6,
		manifoldC: 41.7,
		manifoldPressureKPaAsPrinted: 172.4,
		airM3min: 109.4,
		exhaustManifoldC: 538.1,
		exhaustC: 364.0,
		exhaustM3min: 241.0,
		jacketHeatKW: 373.2,
		atmosphereHeatKW: 102.7,
		exhaustHeatKW: 943.1,
		oilCoolerHeatKW: 136.4
	},
	{
		loadPercent: 70.0,
		electricalKW: 1050.0,
		brakeKW: 1160.6,
		bsfc: 211.7,
		fuelLh: 289.1,
		manifoldC: 43.2,
		manifoldPressureKPaAsPrinted: 201.5,
		airM3min: 119.5,
		exhaustManifoldC: 557.4,
		exhaustC: 371.1,
		exhaustM3min: 267.4,
		jacketHeatKW: 408.4,
		atmosphereHeatKW: 107.4,
		exhaustHeatKW: 1060.5,
		oilCoolerHeatKW: 155.5
	},
	{
		loadPercent: 75.0,
		electricalKW: 1125.0,
		brakeKW: 1239.1,
		bsfc: 210.2,
		fuelLh: 306.4,
		manifoldC: 44.2,
		manifoldPressureKPaAsPrinted: 214.2,
		airM3min: 123.8,
		exhaustManifoldC: 566.8,
		exhaustC: 374.8,
		exhaustM3min: 279.5,
		jacketHeatKW: 425.1,
		atmosphereHeatKW: 109.9,
		exhaustHeatKW: 1117.5,
		oilCoolerHeatKW: 164.9
	},
	{
		loadPercent: 80.0,
		electricalKW: 1200.0,
		brakeKW: 1318.1,
		bsfc: 208.6,
		fuelLh: 323.5,
		manifoldC: 45.1,
		manifoldPressureKPaAsPrinted: 225.8,
		airM3min: 127.6,
		exhaustManifoldC: 576.2,
		exhaustC: 378.6,
		exhaustM3min: 290.7,
		jacketHeatKW: 441.1,
		atmosphereHeatKW: 112.4,
		exhaustHeatKW: 1173.1,
		oilCoolerHeatKW: 174.0
	},
	{
		loadPercent: 90.0,
		electricalKW: 1350.0,
		brakeKW: 1479.0,
		bsfc: 204.4,
		fuelLh: 355.7,
		manifoldC: 46.7,
		manifoldPressureKPaAsPrinted: 243.9,
		airM3min: 134.1,
		exhaustManifoldC: 594.8,
		exhaustC: 386.4,
		exhaustM3min: 310.0,
		jacketHeatKW: 470.6,
		atmosphereHeatKW: 117.9,
		exhaustHeatKW: 1272.1,
		oilCoolerHeatKW: 191.4
	},
	{
		loadPercent: 100.0,
		electricalKW: 1500.0,
		brakeKW: 1644.9,
		bsfc: 201.9,
		fuelLh: 390.8,
		manifoldC: 49.4,
		manifoldPressureKPaAsPrinted: 261.6,
		airM3min: 139.8,
		exhaustManifoldC: 618.6,
		exhaustC: 402.6,
		exhaustM3min: 332.3,
		jacketHeatKW: 501.9,
		atmosphereHeatKW: 124.3,
		exhaustHeatKW: 1397.5,
		oilCoolerHeatKW: 210.2
	}
];

const interpolatedFields: readonly (keyof PerformancePoint)[] = [
	'loadPercent',
	'electricalKW',
	'brakeKW',
	'bsfc',
	'fuelLh',
	'manifoldC',
	'manifoldPressureKPaAsPrinted',
	'airM3min',
	'exhaustManifoldC',
	'exhaustC',
	'exhaustM3min',
	'jacketHeatKW',
	'atmosphereHeatKW',
	'exhaustHeatKW',
	'oilCoolerHeatKW'
];

/**
 * Bounded piecewise-linear lookup: source anchors are nominal OEM data,
 * intermediate values are interpolations, never transient predictions.
 * Loads outside 10–100% and nonfinite input are rejected rather than extrapolated.
 */
export function calculateOperatingPoint(loadPercent: number): OperatingPoint {
	if (!Number.isFinite(loadPercent) || loadPercent < 10 || loadPercent > 100) {
		throw new RangeError(
			'The EM1898-00 map supports finite electrical loads from 10% to 100% only.'
		);
	}

	const upperIndex = performanceMap.findIndex((point) => point.loadPercent >= loadPercent);
	const upper = performanceMap[upperIndex];
	const lower = performanceMap[Math.max(0, upperIndex - 1)];
	const fraction =
		upper.loadPercent === lower.loadPercent
			? 0
			: (loadPercent - lower.loadPercent) / (upper.loadPercent - lower.loadPercent);
	const values = {} as PerformancePoint;
	for (const field of interpolatedFields) {
		values[field] = lower[field] + fraction * (upper[field] - lower[field]);
	}

	// L/h × kg/L × kJ/kg ÷ 3600 = kW of LHV fuel input (PERF009 basis).
	const fuelThermalKW =
		(values.fuelLh * engineSpecs.fuelDensityKgL * engineSpecs.fuelLowerHeatingValueKJkg) / 3600;
	const angularSpeedRadS = (engineSpecs.rpm * 2 * Math.PI) / 60;

	return {
		...values,
		rpm: engineSpecs.rpm,
		frequencyHz: engineSpecs.frequencyHz,
		torqueNm: (values.brakeKW * 1000) / angularSpeedRadS,
		fuelThermalKW,
		efficiencyPercent: (values.electricalKW / fuelThermalKW) * 100,
		brakeEfficiencyPercent: (values.brakeKW / fuelThermalKW) * 100,
		evidence: performanceMap.some((point) => point.loadPercent === loadPercent)
			? 'reported'
			: 'interpolated',
		sourceId: 'PERF005',
		performanceNumber: 'EM1898-00',
		pressureReference: 'unresolved'
	};
}

/** Nominal geometry/speed calculations: educational kinematics, not internal CAD. */
export const nominalKinematics = {
	shaftRevolutionsPerSecond: engineSpecs.rpm / 60,
	angularSpeedRadS: (engineSpecs.rpm * 2 * Math.PI) / 60,
	cyclesPerCylinderPerSecond: engineSpecs.rpm / 120,
	firingEventsPerSecond: (engineSpecs.rpm / 120) * engineSpecs.cylinders,
	meanPistonSpeedMs: (2 * (engineSpecs.strokeMm / 1000) * engineSpecs.rpm) / 60,
	computedDisplacementL:
		(Math.PI / 4) *
		(engineSpecs.boreMm / 1000) ** 2 *
		(engineSpecs.strokeMm / 1000) *
		engineSpecs.cylinders *
		1000
} as const;

export const PERFORMANCE_MAP = performanceMap;
