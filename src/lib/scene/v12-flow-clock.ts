import { DIRECTED_FLOW_PITCH_MM, DIRECTED_FLOW_SPEED_MM_S } from './directed-flow-volume';

/** A presentation clock, independent of the mechanical/thermodynamic state. Repeating flow
 * features must travel less than half a pitch per displayed frame to avoid wagon-wheel reversal.
 * Slower playback retains the driven clock; rapid playback caps optical speed without skipping. */
export class V12FlowClock {
	private previousDrive: number | null = null;
	seconds = 0;
	update(driveAngle: number, running: boolean, elapsedSeconds?: number): number {
		if (
			!Number.isFinite(driveAngle) ||
			(elapsedSeconds !== undefined && (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0))
		)
			throw new RangeError('Finite flow clock and nonnegative frame interval required');
		const delta = this.previousDrive === null ? 0 : driveAngle - this.previousDrive;
		if (
			this.previousDrive === null ||
			elapsedSeconds === undefined ||
			delta < 0 ||
			(!running && delta !== 0)
		) {
			// Explicit phase seeks reconstruct a deterministic presentation; pausing alone never jumps.
			this.seconds = driveAngle / 90;
		} else if (running) {
			this.seconds += Math.min(
				delta / 90,
				elapsedSeconds * 1.5,
				(DIRECTED_FLOW_PITCH_MM / DIRECTED_FLOW_SPEED_MM_S) * 0.2
			);
		}
		this.previousDrive = driveAngle;
		return this.seconds;
	}
}
