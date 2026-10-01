/** Execution provenance travels with saved and exported optimization studies. */
export type GpuComputePreference = 'auto' | 'webgpu' | 'cpu';

export interface GpuComputationReport {
	backend: 'webgpu' | 'cpu';
	library: 'JAX-JS' | 'JavaScript';
	precision: 'float32 + Float64 verification' | 'Float64';
	device: string;
	requested: GpuComputePreference;
	/** Includes initialization, compilation, transfers, checks and refinement. */
	totalMs: number;
	/** Wall time including GPU compilation / dispatch / transfer for the full coarse grid. */
	batchMs: number;
	geometryPreparationMs: number;
	verificationMs: number;
	validatedDesigns: number;
	maxRelativeError: number;
	/** Error envelope used for checking and conservative threshold classification. */
	relativeTolerance: number;
	guardedThresholdDesigns: number;
	coarseDesigns: number;
	coarsePhasesPerCondition: number;
	sectionEvaluations: number;
	fallbackReason?: string;
	note: string;
}
