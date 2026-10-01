"""Exact OCCT solid for the design-lab rod family; units are millimetres.

This creates a new demonstrator derivative, not a modified purchased component.
The renderer and analytic mass model use the same union of eyes and three web
layers. Physics in the design lab remains a separate idealized shank model.
"""

import json
import math
from pathlib import Path
import sys

try:
    import OCP
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
    from OCP.BRepBndLib import BRepBndLib
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.BRepGProp import BRepGProp
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
    from OCP.Bnd import Bnd_Box
    from OCP.GProp import GProp_GProps
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.Interface import Interface_Static
    from OCP.ShapeUpgrade import ShapeUpgrade_UnifySameDomain
    from OCP.STEPControl import STEPControl_AsIs, STEPControl_Reader, STEPControl_Writer
    from OCP.TopAbs import TopAbs_SOLID
    from OCP.TopExp import TopExp_Explorer
    from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt
except ImportError:
    print("The selected Python runtime does not contain OCP.", file=sys.stderr)
    sys.exit(78)

SCHEMA = "rod-solid-v1"
DENSITY_KG_M3 = 7850
BOUNDS = {
    "rodLengthMm": (110, 160),
    "rodWidthMm": (14, 28),
    "rodDepthMm": (12, 22),
    "webMm": (2, 6),
    "flangeMm": (2, 5),
}


def validate_params(raw):
    if not isinstance(raw, dict) or set(raw) != set(BOUNDS):
        raise ValueError("Exactly the five rod geometry parameters are required.")
    result = {}
    for name, (minimum, maximum) in BOUNDS.items():
        value = raw[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{name} must be a number.")
        if not math.isfinite(value) or not minimum <= value <= maximum:
            raise ValueError(f"{name} is outside the supported design range.")
        result[name] = float(value)
    if result["webMm"] >= result["rodWidthMm"]:
        raise ValueError("The web must be narrower than the flange.")
    if 2 * result["flangeMm"] >= result["rodDepthMm"]:
        raise ValueError("The two flanges must leave a positive web depth.")
    return result


def cylinder(radius, y, depth):
    axis = gp_Ax2(gp_Pnt(0, y, -depth / 2), gp_Dir(0, 0, 1))
    return BRepPrimAPI_MakeCylinder(axis, radius, depth).Shape()


def boolean(operation, first, second):
    builder = operation(first, second)
    builder.Build()
    if not builder.IsDone():
        raise ValueError("The CAD Boolean operation failed.")
    return builder.Shape()


def build_rod(params):
    p = validate_params(params)
    length, width, depth, web, flange = (p[name] for name in BOUNDS)
    solid = boolean(BRepAlgoAPI_Fuse, cylinder(32, 0, depth), cylinder(15, length, depth))
    for layer_width, z, layer_depth in (
        (width, -depth / 2, flange),
        (web, -depth / 2 + flange, depth - 2 * flange),
        (width, depth / 2 - flange, flange),
    ):
        layer = BRepPrimAPI_MakeBox(gp_Pnt(-layer_width / 2, 0, z), layer_width, length, layer_depth).Shape()
        solid = boolean(BRepAlgoAPI_Fuse, solid, layer)
    for radius, y in ((25, 0), (9, length)):
        # Extend the cutting tools beyond each end face to avoid coincident caps.
        solid = boolean(BRepAlgoAPI_Cut, solid, cylinder(radius, y, depth + 2))
    clean = ShapeUpgrade_UnifySameDomain(solid, True, True, False)
    clean.Build()
    solid = clean.Shape()
    if not BRepCheck_Analyzer(solid, True).IsValid() or solid_count(solid) != 1:
        raise ValueError("The generated rod is not one valid solid.")
    return solid


def solid_count(shape):
    explorer = TopExp_Explorer(shape, TopAbs_SOLID)
    count = 0
    while explorer.More():
        count += 1
        explorer.Next()
    return count


def volume(shape):
    props = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, props)
    return props.Mass()


def analytic_volume(params):
    p = validate_params(params)

    def profile_area(width):
        # Subtract the two half-disc/rectangle intersections, and both bores.
        def overlap(radius):
            half = min(width / 2, radius)
            return half * math.sqrt(radius * radius - half * half) + radius * radius * math.asin(half / radius)

        return width * p["rodLengthMm"] + math.pi * (32**2 + 15**2 - 25**2 - 9**2) - overlap(32) - overlap(15)

    return profile_area(p["webMm"]) * (p["rodDepthMm"] - 2 * p["flangeMm"]) + 2 * profile_area(p["rodWidthMm"]) * p["flangeMm"]


def export_verified(params, output_dir):
    params = validate_params(params)
    solid = build_rod(params)
    solid_volume = volume(solid)
    expected_volume = analytic_volume(params)
    relative_error = abs(solid_volume - expected_volume) / expected_volume
    if relative_error > 1e-8:
        raise ValueError("CAD volume does not match the independent analytic union volume.")

    output_dir = Path(output_dir)
    step_path = output_dir / "rod.step"
    Interface_Static.SetCVal_s("write.step.schema", "AP214IS")
    Interface_Static.SetCVal_s("write.step.unit", "MM")
    writer = STEPControl_Writer()
    if writer.Transfer(solid, STEPControl_AsIs) != IFSelect_RetDone:
        raise ValueError("The STEP transfer failed.")
    if writer.Write(str(step_path)) != IFSelect_RetDone:
        raise ValueError("The STEP file could not be written.")

    reader = STEPControl_Reader()
    if reader.ReadFile(str(step_path)) != IFSelect_RetDone or reader.TransferRoots() != 1:
        raise ValueError("The STEP file could not be reimported.")
    reimported = reader.OneShape()
    round_trip_valid = BRepCheck_Analyzer(reimported, True).IsValid() and solid_count(reimported) == 1
    round_trip_error = abs(volume(reimported) - solid_volume) / solid_volume
    if not round_trip_valid or round_trip_error > 1e-8:
        raise ValueError("The STEP round-trip solid or volume check failed.")

    box = Bnd_Box()
    BRepBndLib.AddOptimal_s(solid, box, False, False)
    minimum, maximum = box.CornerMin(), box.CornerMax()
    report = {
        "schemaVersion": SCHEMA,
        "params": params,
        "kernel": f"OCP {OCP.__version__}",
        "units": "mm",
        "valid": True,
        "solidCount": 1,
        "volumeMm3": solid_volume,
        "massKg": solid_volume * DENSITY_KG_M3 * 1e-9,
        "densityKgM3": DENSITY_KG_M3,
        "densityProvenance": "Assumed representative steel; not a verified source material",
        "boundsMm": {
            "min": [minimum.X(), minimum.Y(), minimum.Z()],
            "max": [maximum.X(), maximum.Y(), maximum.Z()],
        },
        "analyticVolumeMm3": expected_volume,
        "relativeVolumeError": relative_error,
        "stepRoundTripValid": round_trip_valid,
        "stepRoundTripRelativeVolumeError": round_trip_error,
        "limitations": [
            "New parametric concept derivative; not a recovered feature history of the purchased rod.",
            "Sharp shoulder geometry without fillets, cap joint, bolts, bearings, tolerances or manufacturing detail.",
            "Solid validity and volume checks do not validate stress, buckling, fatigue or engine performance.",
            "Structural results in the design lab use an idealized uniform shank, not a full 3D solid solve.",
        ],
    }
    (output_dir / "report.json").write_text(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("One output directory is required.")
        payload = sys.stdin.read(4097)
        if len(payload) > 4096:
            raise ValueError("The input is too large.")
        export_verified(json.loads(payload), Path(sys.argv[1]))
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(65)
