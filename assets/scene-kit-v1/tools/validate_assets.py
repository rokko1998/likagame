#!/usr/bin/env python3
"""Read-only checks for the actual PNGs referenced by scene manifests."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
errors, rows, seen, targets = [], [], set(), []
def add_nodes(nodes,base):
    for node in nodes:
        targets.append((base/node['file'],'sprite'))
        add_nodes(node.get('children',[]),base)
for mf in sorted(ROOT.glob('0*/manifest.json')):
    manifest = json.loads(mf.read_text())
    bgs = [x for x in manifest['layers'] if x['kind'] == 'background']
    if len(bgs) != 1:
        errors.append(f'{mf.parent.name}: expected exactly one background')
    ids=[x['id'] for x in manifest['layers']]
    if len(ids)!=len(set(ids)):
        errors.append(f'{mf.parent.name}: duplicate layer IDs')
    for puppet in manifest.get('puppets',[]):
        add_nodes(json.loads((mf.parent/puppet['file']).read_text())['nodes'],mf.parent)
    for layer in manifest['layers']:
        if not layer.get('file'):
            continue
        targets.append((mf.parent/layer['file'],layer['kind']))
for item in json.loads((ROOT/'shared/inventory.json').read_text())['assets']:
    targets.append((ROOT/'shared'/item['file'],'ui'))
for raw_path,kind in targets:
        path = raw_path.resolve()
        if path in seen:
            continue
        seen.add(path)
        if not path.is_file():
            errors.append(f'Missing: {path}')
            continue
        with Image.open(path) as im:
            row = {'file': str(path.relative_to(ROOT)), 'size': list(im.size), 'mode': im.mode}
            if im.format != 'PNG':
                errors.append(f'{path.name}: not PNG')
            if kind == 'background' and im.size != (1672,941):
                errors.append(f'{path.name}: unexpected background dimensions')
            if kind != 'background':
                if 'A' not in im.getbands():
                    errors.append(f'{path.name}: missing alpha channel')
                else:
                    alpha = im.getchannel('A')
                    hist = alpha.histogram()
                    row.update(alphaRange=list(alpha.getextrema()), transparentPixels=hist[0],
                               transparentPercent=round(100 * hist[0] / (im.width*im.height), 2),
                               visibleBBox=alpha.getbbox())
                    if hist[0] == 0:
                        errors.append(f'{path.name}: no completely transparent pixels')
                    if sum(hist[1:]) == 0:
                        errors.append(f'{path.name}: empty image')
            rows.append(row)
report = {'pass': not errors, 'checkedFiles': len(rows), 'errors': errors, 'files': rows,
          'note': 'Numeric alpha check complements visual inspection; it cannot prove absence of halos or a baked checkerboard inside visible pixels.'}
out = ROOT / 'review' / 'alpha-report.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['pass','checkedFiles','errors']}, ensure_ascii=False, indent=2))
raise SystemExit(0 if not errors else 1)
