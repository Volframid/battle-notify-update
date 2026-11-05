"""Build a public install ZIP from the verified Toolbox manifest only."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('output', help='Destination ZIP outside the module directory')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = Path(args.output).resolve()
if output == root or root in output.parents:
    raise SystemExit('Choose an output outside the module directory')
manifest = json.loads((root / 'manifest.json').read_text())
files = []
for name, value in manifest['files'].items():
    source = (root / name).resolve()
    if root not in source.parents or any(part in ('data', 'logs', 'LOCAL_UPDATES.md', 'module.config.json') for part in Path(name).parts):
        raise SystemExit('Private or invalid package entry: ' + name)
    data = source.read_bytes()
    expected = value if isinstance(value, str) else value['hash']
    if hashlib.sha256(data).hexdigest().upper() != expected.upper():
        raise SystemExit('Regenerate manifest; changed file: ' + name)
    files.append((name, data))
files.append(('manifest.json', (root / 'manifest.json').read_bytes()))
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, data in files:
        archive.writestr('battle-notify-update/' + name, data)
print('Packaged', len(files), 'verified public files:', output)
