import {
	DESIGN_MATERIAL,
	ROD_INTERFACES,
	evaluateRod,
	type DesignParams
} from '$lib/design/design-core';

/** Coefficients of the same uniform-shank Timoshenko screening model used by the analysis. */
export function designFieldCoefficients(params: DesignParams) {
	const rod = evaluateRod(params);
	const e = DESIGN_MATERIAL.youngsModulusMpa;
	const g = e / (2 * (1 + DESIGN_MATERIAL.poissonRatio));
	return {
		start: ROD_INTERFACES.bigEndOuterRadiusMm,
		end: params.rodLengthMm - ROD_INTERFACES.smallEndOuterRadiusMm,
		span: rod.spanMm,
		axial: rod.axialStressMpa,
		bendingCoefficient: params.lateralLoadN / (2 * rod.iStrongMm4),
		maximumStress: rod.stressMpa,
		bendingDeflectionCoefficient: params.lateralLoadN / (48 * e * rod.iStrongMm4),
		shearDeflectionCoefficient: params.lateralLoadN / (2 * g * rod.shearAreaMm2),
		maximumDeflection: rod.deflectionMm
	};
}

/** The mask and field are evaluated at each fragment's local position, never interpolated as colors. */
export const DESIGN_FIELD_FRAGMENT = `
if (uDesignBeam.w > 0.5) {
  if (vDesignPosition.y < uDesignBeam.x || vDesignPosition.y > uDesignBeam.y) {
    diffuseColor.rgb = uDesignUnassessed;
  } else {
    float fieldX = min(vDesignPosition.y - uDesignBeam.x, uDesignBeam.y - vDesignPosition.y);
    float fieldValue;
    if (uDesignBeam.w < 1.5) {
      fieldValue = abs(-uDesignStress.x + uDesignStress.y * fieldX * vDesignPosition.z) / max(1e-12, uDesignStress.z);
    } else {
      float span = uDesignBeam.z;
      float displacement = uDesignDeflection.x * fieldX * (3.0 * span * span - 4.0 * fieldX * fieldX) + uDesignDeflection.y * fieldX;
      fieldValue = abs(displacement) / max(1e-12, uDesignDeflection.z);
    }
    fieldValue = clamp(fieldValue, 0.0, 1.0);
    diffuseColor.rgb = fieldValue < 0.55
      ? mix(uDesignCool, uDesignMid, fieldValue / 0.55)
      : mix(uDesignMid, uDesignHot, (fieldValue - 0.55) / 0.45);
  }
}
`;
