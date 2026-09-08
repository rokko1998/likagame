import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
scenes=[]
for mf in sorted(root.glob('0*/manifest.json')):
    scene=json.loads(mf.read_text())
    for puppet in scene.get('puppets',[]):
        puppet['data']=json.loads((mf.parent/puppet['file']).read_text())
    scenes.append(scene)
(root/'review/scene-data.js').write_text('window.KIT = '+json.dumps({'scenes':scenes},ensure_ascii=False)+';\n')
print('Built review data for',len(scenes),'scenes')
