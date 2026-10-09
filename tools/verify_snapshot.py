"""Verify preserved source/skill bytes before cloud continuation."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'snapshot-manifest.json').read_text())
bad = []
for item in manifest['files']:
    path = root / item['path']
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
        bad.append(item['path'])
print(json.dumps({'files': len(manifest['files']), 'mismatches': bad}))
raise SystemExit(bool(bad))
