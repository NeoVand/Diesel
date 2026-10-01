# Engine resource package audit

Read-only audit on 1 October 2026 of the repository, reachable Git paths and current static `build/` artifact. No GPU session, recording, resource regeneration or application change was performed.

## Complete geometry and integrity

All five packaged resources passed the following checks: the manifest's source length and SHA-256 matched `src/lib/engine/runtime-assets.json`; every encrypted chunk matched its declared length and SHA-256; AES-256-GCM authentication and gzip decoding succeeded; the decoded resource matched the verified source hash and was byte-for-byte identical to its local file under `static/models/`. Every built encrypted chunk also matched its tracked counterpart.

| Resource                     | Decoded bytes | Result            |
| ---------------------------- | ------------: | ----------------- |
| `v12-review.glb`             |    69,554,040 | All checks passed |
| `v12-cams-refined.glb`       |     3,920,996 | All checks passed |
| `v12-clearance-refined.json` |         7,057 | All checks passed |
| `v12-clearance-refined.bin`  |    25,565,628 | All checks passed |
| `v12-chamber-domains.bin`    |       393,216 | All checks passed |

The package contains **12 distinct encrypted chunks**, plus `manifest.json` and `NOTICE.txt`: 14 files in both Git and the built package. The five resources total **99,440,937 decoded bytes**, represented by **63,217,187 compressed/encrypted bytes**. This packaging step preserves the prepared runtime geometry without further simplification; it does not reproduce the original vendor authoring project.

The decoded primary GLB contains all **1,253 source node IDs**, exactly matching the public catalog. The application's 24 decorative IDs are present; the remaining **1,229 IDs are mechanical bodies**. The public catalog is byte-identical between source and build. Its names, source paths, classifications and triangle counts are deliberately public metadata: the catalog JSON is not encrypted or independently hash-checked at runtime. The source geometry containing those identities is encrypted and hash-checked.

## Distribution boundaries

At audit time, the checkout had 544 tracked files and the static artifact had 87 files. No standalone geometry, editable CAD or source archive was found among current tracked files, reachable Git object paths, or built files. The extension check included GLB, glTF, OBJ, BIN, STEP/STP, IGES/IGS, FBX, Blender, STL, 3DS, MAX, DAE, Fusion F3D/F3Z, SolidWorks SLDPRT/SLDASM, Inventor IPT/IAM, Parasolid X_T/X_B, ZIP, 7Z and RAR. There were no published `references/`, private `work/` or `.env` files in the static artifact.

All eight checked private paths are ignored by Git: the purchased Fusion original, `.env`, the local package-key file, and the five loose runtime resources. The local package-key file has mode `0600`.

The exact current OpenAI and ElevenLabs credential values from the local environment were searched across every current tracked file and every built file; neither occurred. Values were read only in memory and were not printed or saved. This is a check for those known credentials, not a guarantee about arbitrary unknown secrets or every historical blob's contents. The Git-history check examined paths for excluded assets and environment files, rather than scanning every historical blob for credential contents.

The resource-decoding key is intentionally delivered in the hosted application's JavaScript. Keeping its original key file outside Git does not make that delivered key secret. It is not an OpenAI or ElevenLabs credential.

## Licence scope and extraction limits

Client-side encryption discourages straightforward extraction and standalone reuse; it is **not DRM and does not make browser-rendered geometry unextractable**. The browser must receive both the resources and enough information to decode them. The resource notice grants no standalone model rights.

The linked incorporation guidance applies only if the purchased asset is covered by [CGTrader's Royalty Free License](https://help.cgtrader.com/hc/en-us/articles/360015124437-Royalty-Free-License); the actual purchase terms and any seller-specific restrictions govern. That guidance describes incorporation into software and reasonable measures to restrict direct resource access, including encryption. Encryption is a technical safeguard, not proof of licence compliance. This audit did not locate a receipt or accepted licence record establishing the purchase's exact terms, and does not provide a blanket distribution or licensing guarantee.

## Known boundary and repeatability

The current artifact is clean. The build finalizer is nevertheless a targeted safeguard: it scans `build/models/`, not every possible directory below `static/`, and its removal list does not cover every editable CAD or archive extension, including Fusion `.f3d`. The ignore rules likewise protect the current expected files rather than every future asset filename. Placing new originals elsewhere under `static/` can therefore publish them; repeat the artifact inspection after changing packaged assets or their locations.

To repeat the audit without regenerating assets:

1. Compare the five-file allowlist in [`runtime-assets.json`](../../src/lib/engine/runtime-assets.json) with [`static/engine-runtime/manifest.json`](../../static/engine-runtime/manifest.json). Read and hash every referenced chunk, authenticate/decrypt each file with the authorised local resource key, decompress it, and compare its byte length, SHA-256 and local source bytes. Do not print the key.
2. Parse the decoded primary GLB's JSON chunk and compare its node IDs against [`v12-review.manifest.json`](../../static/models/v12-review.manifest.json); confirm the decorative exclusion in [`definition.ts`](../../src/lib/engine/definition.ts). Compare the built catalog and encrypted chunks to their source counterparts.
3. Inspect `git ls-files`, `git rev-list --objects --all`, ignore decisions and the complete built file inventory. Check known credential values without emitting them. Historical path checks and current-content checks have the distinct scopes described above.
4. Review the packer, runtime validator and build finalizer together: [`pack-engine-assets.mjs`](../../scripts/pack-engine-assets.mjs), [`packaged-assets.ts`](../../src/lib/engine/packaged-assets.ts), and [`finalize-browser-build.mjs`](../../scripts/finalize-browser-build.mjs). The packer regenerates resources; it is not a read-only audit command. [`packaged-assets.test.ts`](../../src/lib/engine/packaged-assets.test.ts) separately exercises corruption, size, manifest and cancellation handling with fixtures.

The earlier [packaged static browser check](packaged-static.md) supplies actual browser decoding and rendering evidence. This audit establishes file completeness and the stated packaging boundaries for the inspected artifact; it does not replace that browser check or establish engineering accuracy or licence rights.
