/** Archived Cat reference only. Never use for the active generic V12. */
export const engineSpecs = {
	model: 'Caterpillar 3512C',
	configuration: 'V12 · four-stroke · electronic unit injection',
	cylinders: 12,
	displacementL: 51.8,
	boreMm: 170,
	strokeMm: 190,
	compressionRatio: 14.7,
	rpm: 1800,
	frequencyHz: 60,
	standbyKW: 1500,
	powerFactor: 0.8,
	engineControl: 'ADEM A3 (nominal family)',
	performanceNumber: 'EM1898-00',
	calibrationLabel: '1500 ekW standby · EM1898-00 · nominal OEM reference',
	geometryStatus: 'Purchased generic 3512 geometry; serial and engine arrangement unverified',
	serialStatus: 'No physical engine serial identified',
	fuelDensityKgL: 0.85,
	fuelLowerHeatingValueKJkg: 42780
} as const;
