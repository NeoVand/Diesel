# Open-cylinder air-standard reference case

This study solves cylinder mass and internal energy over a repeating four-stroke cycle. Pressure and temperature follow the ideal-gas state; they are not prescribed display curves. The solver uses the purchased engine's measured piston motion and corrected valve-lift profiles. Reservoir conditions, clearance volume, gas properties, heat input, and heat transfer are explicitly assumed.

The result is a verified numerical study case, not a calibrated prediction of this concept engine's power, fuel consumption, emissions, or durability. It is independent of the display's conservative chamber occupancy and of the separate steady manifold-flow fields.

## Geometry and declared case

| Quantity                    | Value and basis                                                              |
| --------------------------- | ---------------------------------------------------------------------------- |
| Bore / stroke / rod centres | 85 / 100 / 125 mm, measured source geometry                                  |
| Cylinder / phase reference  | `v12-0003`; angle relative to its corrected compression TDC                  |
| Valve opening               | Actual source-profile curtain area, capped at the native seat-bore area      |
| Speed                       | 1,800 rpm, assumed case speed; independent of presentation playback          |
| Compression ratio           | 16:1, assumed; sets clearance volume, not measured chamber volume            |
| Intake reservoir            | 1.1 bar absolute, 320 K                                                      |
| Exhaust reservoir           | 1.2 bar absolute, 650 K                                                      |
| Gas                         | Ideal air, R = 287.05 J/(kg K), γ = 1.4, constant heat capacities            |
| Valve discharge coefficient | 0.65, assumed for both directions                                            |
| Heat input                  | 950 J per cylinder per 720° cycle; replaces chemical combustion              |
| Heat-release law            | Normalized finite Wiebe form, start −4°, duration 74°, shape 6.9, exponent 3 |
| Wall model                  | 450 K; constant 250 W/(m² K), over an equivalent cylindrical surface         |

Heat addition does not add fuel mass: this is an air-standard working-fluid model. Reservoir temperatures supply the upstream enthalpy for inward flow. When pressure reverses, the same valve can flow outward with the cylinder's enthalpy. There is no forced intake/exhaust flow sign.

## Governing equations

Using positive valve mass flow into the cylinder:

`dm/dt = ṁintake + ṁexhaust`

`dU/dt = Q̇release + Q̇wall − p dV/dt + Ḣintake + Ḣexhaust`

`T = U/(m cv)` and `p = (γ − 1)U/V`, with `cv = R/(γ − 1)`.

Each enthalpy flux is its signed mass flow multiplied by `cp Tupstream`; wall heat is `h A (Twall − T)`. The mass/internal-energy formulation follows the [Cantera control-volume equations](https://cantera.org/stable/reference/reactors/controlreactor.html). The valve restriction uses the isentropic compressible-orifice relation, including the sonic mass-flow limit described by [NASA Glenn](https://www.grc.nasa.gov/www/k-12/BGP/mflchk.html). An assumed discharge coefficient accounts for an unspecified real restriction; it is not a calibrated port-loss model.

The exact slider-crank volume derivative supplies piston work. Time derivatives are converted using 6 × rpm crank degrees per second. The source curtain areas follow actual geometric valve lift throughout the cycle, including late intake closure. The thermal surface is an equivalent bore/head/piston cylinder, not a detailed CAD-derived heat-transfer mesh.

## Numerical method and verification

The TypeScript implementation uses deterministic fourth-order Runge–Kutta integration. Heat added across every step is corrected to the exact integral of the declared finite Wiebe function, avoiding a step-boundary loss of the truncated tail. A signed ledger independently accumulates valve mass, upstream enthalpy, wall heat, heat input, and piston work. Nonpositive intermediate states fail explicitly rather than being silently clamped.

Repeated cycles converge in six passes. The final 0.0625° result has relative start/end differences of approximately 1.27 × 10⁻¹¹ in mass and 2.78 × 10⁻¹² in internal energy. Its conservation residuals are approximately 2.71 × 10⁻¹⁸ kg and 1.71 × 10⁻¹³ J. These ledger residuals measure numerical conservation; they do not establish physical model fidelity.

Refinement uses 0.25°, 0.125°, and 0.0625° integration steps. The 0.125° to 0.0625° change in indicated cycle work is about 0.000035 J. A separately written Python/SciPy DOP853 calculation shares only the declared inputs and measured valve tables. At whole-degree comparison points, maximum relative differences from the final TypeScript result are:

| State                      | Maximum relative difference |
| -------------------------- | --------------------------: |
| Pressure / internal energy |                   0.001773% |
| Mass                       |                   0.001466% |
| Temperature                |                   0.000460% |

Tests also recover the closed, adiabatic motored identities `p V^γ = constant` and `T V^(γ−1) = constant`, verify the analytical choking limit and donor enthalpy under reverse flow, check exact cycle heat input, enforce positivity, and reject an unconverged state as an accepted periodic result.

The display artifact stores 1,441 points at 0.5° spacing. Its sampler uses Hermite interpolation of conserved mass and energy with ODE endpoint slopes, then recomputes pressure and temperature from the ideal-gas state and exact volume. Full-grid comparison against the 0.0625° integration bounds pressure interpolation error below 0.05%. There is no ODE integration inside an animation frame, and seeking has no history dependence.

## Case results and interpretation

For these assumptions, peak pressure is about 53.642 bar absolute and peak uniform temperature about 2,012.85 K. Indicated work is 459.757 J per cylinder per cycle, with an indicated mean effective pressure of approximately 8.102 bar. These are case outputs, not engine ratings or brake output.

The cycle transports approximately 606.967 mg of net air through the cylinder. About 5.018 mg reverses through the intake during portions of gas exchange. The chosen case has no exhaust reverse flow; the model permits it. Integrated wall heat is approximately −147.150 J into the gas, with positive wall-to-gas heat transfer during colder portions of the cycle. Both directions are preserved rather than clipped.

Constant specific heats, uniform temperature, imposed heat release, fixed reservoirs, empirical discharge coefficient, and constant wall transfer deliberately limit this model. It excludes detailed chemistry, fuel evaporation coupling, species transport, spatial mixing, compressibility waves, turbulence, friction, turbo matching, blowby, and structural heat flow. The steady manifold particle fields must not be described as a coupled transient solution of this case.

## Files and reproduction

- Solver: `src/lib/engine/v12-cylinder-cycle.ts`.
- Precomputed case and sampler: `src/lib/engine/v12-cycle-study.ts` and `v12-cycle-study.json`.
- Tests: `src/lib/engine/v12-cylinder-cycle.test.ts`.
- Independent reference, numerical report, and builders: `references/00_Active_V12/cycle-verification/`.

With the local development server running, `build-cycle-study.mjs` evaluates the production TypeScript solver at three resolutions in an isolated browser context. Run `independent-cycle-reference.py` with NumPy/SciPy for the independent check, then `publish-cycle-study.mjs` to publish only an accepted case. The publisher refuses a nonconverged solve or an independent state discrepancy above 0.05%.
