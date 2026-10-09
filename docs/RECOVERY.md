# Recoverable render cleanup

2026-10-10: the user explicitly approved public archiving of the failed exports and removal of their verified local copies. These files preserve recovery and failure evidence; the working examples do not depend on them.

[Recovery release](https://github.com/supplefrog/frontend-design-lab/releases/tag/local-recovery-2026-10-10) contains `failed-exports.zip`: 245 original paths, 58 unique byte blobs, 240,959,618 logical source bytes, and an 87,296,250-byte ZIP. Its SHA256 is `ab7c675b235b1719154d8f59623cdeb926fe2474e141c09a20b2961385bc2139`. GitHub's digest matched and a full streamed download independently matched before local removal. The ZIP contains original paths, per-file hashes and a restore script that refuses changed existing files.

Download the ZIP, extract `restore.py`, then run `python restore.py failed-exports.zip RECOVERY_ROOT`. Restoration recreates the two original scratch directories beneath the chosen root. Current app outputs, references, TouchDesigner runtime and managed Git worktrees were retained. No proprietary runtime, bridge project or private browser/session data is in this archive.

Only the exact archived files and the verified temporary ZIP were removed. Both source directories are now empty. Observed C: free-space increase during removal was 188,346,368 bytes, including ZIP staging; concurrent activity can affect this figure and logical source bytes include hardlinks. This was agent-executed closeout, not an installed automatic disk watcher. The cloud project has an explicit closeout rule to repeat ownership, reference, hash and durability checks for future scratch.
