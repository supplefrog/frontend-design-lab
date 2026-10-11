# Accepted Mindlatch — 2026-10-12

The user approved the completed local render and requested sync. The authoritative runtime is `outputs/mindlatch-maintained/index.html`; the earlier Mindlatch folders remain historical references. Sondara is unchanged.

Run `python3 -m http.server 8784` from the repository or unpacked bundle, then open `/outputs/mindlatch-maintained/index.html#capture`. There is no dependency installation. The package includes Three.js and its license; notes and the last background selection stay in the browser's local storage.

The accepted render uses 3× output canvas per dimension, 2× supersampling per dimension, a tent filter, and no SMAA/MSAA/temporal filtering. It includes the full 180° grooved chrome lever, companion analog scale, Panel face chrome dial, aligned tactile controls, and glass status tube. The default table is lab pink #ea7fa9; pink/gold balls switch between it and Butter yellow #ffe69a and remember the choice. The rail bolt moves with chassis resizing, and long status text scrolls left with pauses and manual/reduced-motion/standby safeguards.

Prior local verification covered background selection and reload persistence, continuous bolt motion in both directions and reversals, long-message scrolling/manual reading, and reduced-motion/standby behavior. The user accepted the resulting whole render. Sync validation checks exact source bytes, dependency completeness and applicable production checks; these are not a new hardware benchmark or a fresh independent design review.

`docs/mindlatch-accepted-20261012.json` in Git, binds the accepted source and all runtime dependencies. The old comparison labs are excluded. Historical reports remain historical rather than being relabeled as passes.
