import { driver, type DriveStep } from 'driver.js';

export type DemoTourPort = {
	prepare: (step: number) => Promise<void>;
	finish: () => void;
	error: (message: string) => void;
};

/** Each transition prepares and settles the actual engine before highlighting its controls. */
export async function beginDemoTour(port: DemoTourPort) {
	const steps: DriveStep[] = [
		{
			element: '.stage-heading',
			popover: {
				title: 'Source assembly',
				description:
					'This is a purchased concept design with actual modeled internals. Measured geometry and educational explanations are distinguished from unverified performance. Drag to orbit; scroll to inspect.',
				side: 'bottom'
			}
		},
		{
			element: '.hero-actions [aria-label="Explode assembly"]',
			popover: {
				title: 'Exploded view',
				description:
					'Adjust separation to inspect groups and return to the assembled position. Parts retain their source scale.',
				side: 'right'
			}
		},
		{
			element: '.cutaway-controls',
			popover: {
				title: 'Section plane',
				description:
					'Change axis, position, orientation or retained side. This is a whole-engine section; real bores and cavities should remain open.',
				side: 'top'
			}
		},
		{
			element: '.transport',
			popover: {
				title: 'Mechanical playback',
				description:
					'Run, pause and scrub the crank, rods, pistons, timing chains and valve train from any 3D view. The rig uses measured joints, actual cam profiles and documented corrections. Its teaching cycle and slow playback are separate from a calibrated operating speed or combustion model.',
				side: 'top'
			}
		},
		{
			element: '.stage-tools',
			popover: {
				title: 'Component selection',
				description:
					'Select a part for context. Double-click to isolate it; restore the assembly when finished. Every source occurrence keeps its identity across views.',
				side: 'left'
			}
		},
		{
			element: '.hero-actions [aria-label="Component atlas"]',
			popover: {
				title: 'Component atlas',
				description:
					'Browse 22 mechanical component families. Gallery previews use independent fit scales; opening a family returns to the shared-scale 3D scene. Decorative cover lettering is excluded.',
				side: 'right'
			}
		},
		{
			element: '.metrics',
			popover: {
				title: 'Geometry and evidence',
				description:
					'The design measures about 6.81 litres. Power, fuel use, emissions and exact timing have no matched calibration. The evidence panel keeps measured facts and assumptions distinct.',
				side: 'bottom'
			}
		},
		{
			element: '.guide-heading',
			popover: {
				title: 'Assembly assistant',
				description:
					'The assistant can find source bodies, change the current view and cite the available evidence. Requests use the configured AI connection.',
				side: 'top'
			}
		}
	];

	let changing = false;
	let closed = false;
	const tour = driver({
		steps,
		animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
		overlayColor: '#000',
		overlayOpacity: 0.28,
		stagePadding: 6,
		stageRadius: 10,
		popoverClass: 'engine-tour',
		showProgress: true,
		progressText: '{{current}} / {{total}}',
		nextBtnText: 'Continue',
		prevBtnText: 'Back',
		doneBtnText: 'Finish',
		allowClose: true,
		overlayClickBehavior: 'close',
		allowKeyboardControl: true,
		onNextClick: () => void move((tour.getActiveIndex() ?? 0) + 1),
		onPrevClick: () => void move((tour.getActiveIndex() ?? 0) - 1),
		onDoneClick: () => tour.destroy(),
		onDestroyed: () => {
			closed = true;
			port.finish();
		}
	});
	async function move(index: number) {
		if (changing || closed) return;
		if (index >= steps.length) {
			tour.destroy();
			return;
		}
		changing = true;
		try {
			await port.prepare(Math.max(0, index));
			if (!closed) tour.moveTo(Math.max(0, index));
		} catch (error) {
			tour.destroy();
			port.error(error instanceof Error ? error.message : 'The demo could not prepare this view.');
		} finally {
			changing = false;
		}
	}
	await port.prepare(0);
	if (!closed) tour.drive(0);
	return () => tour.destroy();
}
