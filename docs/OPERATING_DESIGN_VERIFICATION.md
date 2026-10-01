# Operating design verification

The operating study connects a prescribed 720° cylinder pressure trace to exact slider-crank kinematics, rod rigid-body dynamics, a bounded geometry search and native full-solid finite-element checks. It supports a reproducible design comparison. It does not yet support an accepted engine or connecting-rod design.

## What drives the calculation

The user chooses speed, piston assembly mass, compression ratio, intake/exhaust pressure, a polytropic exponent and the shape of an added firing-pressure pulse. These are explicit scenario assumptions. No pressure measurement, piston mass or material certificate is available for the purchased generic V12 asset.

Cylinder pressure acts over the selected bore area. Piston inertia and exact authored-rod mass properties determine both pin forces using Newton–Euler translation and rotation balance. The rod's mass, centre of mass and planar polar moment come from analytical integration of the same layered solid that is exported as STEP, including the unequal bearing eyes and bores. The engine renderer, operating plots and native-load request share these dimensions and force conventions.

Force vectors act on the rod; rod-local Y runs from big to small eye, local X lies in the crank plane and local Z follows the bearing axes. Phase 0° is compression/firing TDC. The 720° cycle distinguishes this from the gas-exchange TDC at 360°. A positive plotted compression value is the negative of the local small-end axial force.

The native solve receives the small-end force plus the distributed D'Alembert inertia field of the rod, including translational, angular-acceleration and centripetal terms. Its big-bore fixture is constrained and small-bore traction is prescribed. Bearing contact, fillets, cap joints, bolts, nonlinear material, fatigue and manufacturing validation are outside the current model.

## Search and independent checks

The operating search evaluates 500 bounded four-dimension shapes under three explicit conditions. It uses nominal axial and in-plane bending stress along the uniform shank; it does not reuse the earlier artificial transverse-centre-load beam scenario. Each geometry changes the actual rod mass and inertia used in its operating forces.

The coarse 121-phase grid is a subset of the 721-phase finalist grid. Candidates are sorted by exact mass and recomputed at the finer resolution until three pass the assumed nominal 250 MPa screen. This identifies the lightest passing sampled shape, not a continuous or globally optimal design. Full-solid checks independently assess the compression, tension and nominal-stress critical cases, deduplicating identical conditions and angles.

Verification includes independent numerical solid-volume/moment integration, exact OpenCascade mass properties, full-cycle force/moment closure, gas-work/kinetic-energy/crank-work balance, and independently integrated section inertia. The native implementation also has its own patch, load-linearity, reaction and mesh-refinement checks. Passing these checks verifies implementations of the stated models; it does not validate their operating assumptions.

## Default result and verification gates

The reference rod has a mass of 313.877 g. The default operating search finds a 249.768 g candidate, 20.425% lighter, with nominal peak stress 247.048 MPa against 222.113 MPa for the reference. The reference pressure trace peaks at 67.507 bar; the largest compression case is approximately 35.648 kN at 4° and 1800 rpm. The selected high-speed condition gives approximately 5.788 kN small-end tension near 361° at 3000 rpm.

Independent native analysis shows greater displacement for the candidate: 109.18 µm versus 94.55 µm under compression, and 38.94 µm versus 28.99 µm under tension. The candidate's tension displacement initially changes 8.061% between two meshes, exceeding the declared 8% integral-response screening threshold. A [third-mesh follow-up](./verification/rod-solid-deep-refinement.json) gives 40.742 µm, with last-pair changes of 4.433% in displacement and 3.993% in strain energy. This resolves the integral-response screening gate without changing its tolerance. The nominal mass saving remains **a comparative study result, not an accepted design improvement**: local stress convergence, bearing conditions, fatigue and manufacturing remain unresolved.

The detailed four-case table, complete assumptions and immutable request/result evidence are in [the finalist audit](./verification/operating-finalists.md) and [its JSON record](./verification/operating-finalists.json). The comparison status helper deliberately permits only `incomplete`, `needs-refinement`, or `comparison-only`; it never declares a safe or approved design. Interior stress percentiles are descriptive and are not substituted for a maximum-stress allowable.

## Sources and applicability

- [University of Illinois: Kinetics of rigid bodies](https://mechref.engr.illinois.edu/dyn/reg.html) supports centre-of-mass force and moment balance and clarifies moments about arbitrary reference points.
- [MIT OpenCourseWare: Dynamics and Control I lecture notes](https://ocw.mit.edu/courses/2-003j-dynamics-and-control-i-spring-2007/pages/lecture-notes/) provides primary teaching material on planar rigid-body kinematics, kinetics and energy methods.
- [Sandia Engine Combustion Network: small-bore diesel engine](https://ecn.sandia.gov/engines/small-bore-diesel-engine/) publishes geometry and experiments for a GM 1.9 L research engine. Those data provide a future separate calibration/validation benchmark; they are not measurements of this generic V12 and are not silently transplanted into the current pressure trace.

The road to an accepted result is to obtain pressure and mass evidence for a defined engine, establish realistic bearing/rod boundary conditions and material/fatigue properties, resolve mesh sensitivity, and rerun optimization against those constraints. This demo makes that chain inspectable rather than hiding its assumptions.
