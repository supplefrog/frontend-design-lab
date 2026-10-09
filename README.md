# Frontend Design Lab

Runnable Sondara and Mindlatch design studies, their selected visual references, and the skills needed to continue in cloud. The user accepted their overall direction and the sharpened Mindlatch controls, and prefers its fitted strip display. These are a craft baseline, not a claim that every interaction is finished.

Browse the [live reference hub](https://supplefrog.github.io/frontend-design-lab/).

Run from this repository with Python:

```sh
python3 -m http.server 8784
```

Open `http://localhost:8784/` for the gallery. No product dependency installation is required; Three.js is vendored. Browser audio uses an authored synthetic recording, and notes/excerpts are stored only in that browser.

- [Sondara](outputs/field-audio/index.html): translucent pane, luminous sound ribbons and live audio response.
- [Mindlatch with fitted strip](outputs/mindlatch-strip-study/index.html): the user's preferred finishing treatment.
- [Mindlatch current controls](outputs/mindlatch-trial/index.html): direct physical control input and cached scene rendering.
- [Mindlatch earlier implementation](outputs/mindlatch/index.html): preserved comparison.
- [Accepted qualities and pending work](docs/CONTINUATION.md).
- [Skill snapshot and verification](snapshot-manifest.json).
- [Recoverable cleanup and restore route](docs/RECOVERY.md).

Skill copies retain their originating metadata and licenses; they are portable snapshots, not new canonical owners. Shared skills are maintained in [Agent Sync](https://github.com/supplefrog/agent-sync). They do not load automatically merely because cloud cloned the repository: follow [AGENTS.md](AGENTS.md) and verify the actual reads.

Private host/session/account data, user notes, vendor runtimes, unreviewed TouchDesigner bridge projects and large failed render exports are excluded from the source tree. Generated references are supplied for this user's design work; no blanket license is granted to all project assets. Vendored dependencies retain their own terms in [THIRD-PARTY.md](THIRD-PARTY.md).
