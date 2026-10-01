# Comparison legend layout verification

Verified on the packaged, static-only application at `/Diesel/`, with no application server endpoints, after the responsive comparison-panel fix.

The comparison toolbar remains fixed. The result cards, both field views, their measurements and the common contour scale share one bounded scroll container. The field canvases remain 260 CSS pixels high; the fix does not shrink the rendered fields to hide overflow.

| Display | Browser zoom | Result |
| --- | --- | --- |
| 2560 × 1440 | 150% | Complete scale and scope caption reachable through normal panel scrolling; field switching preserves visibility |
| 1440 × 1000 | 100% | Complete scale and scope caption visible; field switching preserves visibility |

The verification performed an actual candidate search and independent browser solid solves through the UI, opened Compare fields, scrolled with mouse-wheel input in the panel gutter, and switched from stress to displacement. Both canvases used native WebGPU. Neither viewport had horizontal overflow, browser errors or requests to `/api`.

- [150% screenshot](comparison-legend-150.png)
- [Normal-size screenshot](comparison-legend-normal.png)
- [Measured DOM bounds and diagnostics](comparison-legend-layout.json)

Source validation: Svelte autofixer reported no issues; Svelte/TypeScript check reported zero errors and warnings; the changed component passed Prettier and ESLint.
