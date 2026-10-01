# Derived timing-guide supports

The corrected timing-guide placements require matching supports. Translating guides and screws alone leaves their native backing pads and cover holes in the old positions. This document records the local native-CAD corrections, including a pre-existing cover/guide interference discovered during the work. Purchased source files remain unchanged.

## Scope and geometry

The two head occurrences are `v12-0715` and `v12-0666`; the timing cover is `v12-0317`. The block correction (`v12-0665`) is recorded separately in the block mount audit. Every dimension below is in native millimetres. Component scale, the crank datum, gas passages, valve seats and the existing source screw geometry are not redesigned by this work.

- **Positive head:** Three native radius-1.5 through-bores move to the corrected guide axes. Radius-5 swept support pads connect each original boss to its corrected axis. Native axial extent remains Z604–612.
- **Negative head:** The same three local bore/pad moves also extend the original pads from Z612 to Z620, where the negative-bank guide backs actually seat. This 8 mm extension is explicitly derived geometry.
- **Timing cover:** All 22 native radius-1.2645 shaft bores and radius-3.25 × 0.25-deep front counterbores retain their measured dimensions and move to the exact guide/screw axes. Local radius-5 pads maintain their connection to the cover. Long original posts that passed through guides are shortened to the guide front plus the original 0.2 mm axial clearance.
- **Two primary-guide pockets:** Post shortening alone left cover ribs intersecting the corrected primary guides. Two rectangular, machineable clearance pockets bound the union of each original and corrected native guide AABB, expanded by 0.2001 mm. The additional 0.0001 mm separates coincident Boolean planes. The union clears obsolete original-placement ribs and avoids disconnected scraps. The four bank guides retain their already proven 0.2 mm clearance; they receive no additional pocket.

The cover pockets preserve the front support region above Z614.2001. All 22 front supports remain part of the same connected cover solid. These are mechanical reconciliation changes to a concept model, not an authenticated production design.

## Verification

All three final BReps are valid single connected solids. The independent native guide contact checks report:

| Check | Result |
|---|---:|
| Six corrected guide/cover common volumes | 0 mm³ each |
| Four bank guide/cover minimum distances | 0.200000 mm |
| Two primary guide/cover minimum distances | 0.200100 mm |
| Four bank guide/head common volumes | 0 mm³ each |
| Bank guide/head seating distance | 0 mm |
| Front bore axes recovered from final cover | All 22, residual < 0.000001 mm |
| Native material witnesses around front supports | 704/704 inside the connected cover |

The two new pockets remove approximately 2,836.87 and 2,839.25 mm³ from the support-stage cover. Exact tool bounds and the independent per-guide distances are in the audits below.

During Boolean construction, four disconnected invalid films appeared around two mirrored top fillets. They were 0.001229 mm thick and contained entirely within the declared local support sweeps. The builder accepts their removal only when exactly one valid principal solid remains and every discarded-film vertex passes the local bounds check. It never discards a structural disconnected piece. The later primary-pocket construction instead explicitly removes obsolete rib material within the recorded old-to-new guide envelope.

Native coincident subtraction is unreliable for these near-identical detailed solids: direct source/result subtraction returned invalid near-whole-body artifacts. Those results were rejected. Head protected-region adaptive volumes agree; all modifications are constructed from bounded CSG operands. An additional deterministic native point-classification check compared 9,790 points outside all declared operands, including 814 inside the original cover. It found zero mismatches; 210 candidate points inside declared edit neighborhoods were excluded. This finite witness is a regression check, not an exact surface-identity proof or a strength certification.

No fastener preload, thread engagement, cover stiffness, stress, fatigue or manufacturing validation is claimed.

## Evidence and reproduction

Evidence is under `references/00_Active_V12/timing-verification/`:

- `head-cap-mount-audit.json`: native source hashes, exact bore registration, local pads, final file hashes and film bounds.
- `cap-guide-cavity-audit.json`: exact pocket bounds and removed volumes; source containment and final contact checks.
- `head-cap-guide-contact-audit.json`: native original and corrected overlap volumes for all six guides, plus head seating.
- `cap-front-support-audit.json`: final 22 bore axes and 704 native annulus witnesses.
- `cap-preservation-witness-audit.json`: deterministic classification outside the declared edit operands.

Run from the repository root with the configured native Python environment containing OCP. The head/cap and six guide BReps must first be cached from the purchased STEP; `extract-timing-guide-cad.py` records the guide cache without altering the source.

1. `build-head-cap-mounts.py`
2. `build-cap-guide-cavities.py`
3. `verify-head-cap-mounts.py`
4. `verify-cap-front-supports.py`
5. `verify-cap-preservation.py`

Final native outputs are `work/timing-mounts/derived/v12-0715.brep`, `v12-0666.brep`, and `v12-0317.brep`. The runtime asset exporter uses these in the shared refined-geometry pack; generated diagnostic/intermediate shapes are not runtime inputs.
