import study from './v12-cycle-study.json';
import { sampleV12CylinderCycle } from './v12-cylinder-cycle';

/** Precomputed, independently checked declared case; no ODE work occurs in an animation frame. */
export const V12_CYCLE_STUDY = study;

/** Angle is relative to the selected cylinder's declared compression TDC, in crank degrees. */
export function sampleV12CycleStudy(compressionRelativeCrankDeg: number) {
	return sampleV12CylinderCycle(V12_CYCLE_STUDY, compressionRelativeCrankDeg);
}
