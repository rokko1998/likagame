"""Build scene placements and native UI overlays. Source previews remain untouched."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

ROOT=Path(__file__).resolve().parents[1]
SCENES=['01-menu','02-map','03-approach','04-dispatch']

def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

def layer(id,file,rect,z,kind='sprite',label=None,**extra):
    x,y,w,h=rect
    return dict(id=id,file=file,label=label or id,kind=kind,x=x,y=y,width=w,height=h,z=z,pivot=[.5,.5],motion='none',**extra)

def fitted(id,file,rect,z,label=None,**extra):
    im=Image.open(ROOT/'04-dispatch'/file).convert('RGBA')
    b=im.getchannel('A').point(lambda v:255 if v>32 else 0).getbbox()
    x,y,w,h=rect;sx=w/(b[2]-b[0]);sy=h/(b[3]-b[1])
    return layer(id,file,[x-b[0]*sx,y-b[1]*sy,im.width*sx,im.height*sy],z,label=label,**extra)

def build_dispatch():
    d=ROOT/'04-dispatch';(d/'rig').mkdir(exist_ok=True)
    source=Image.open(d/'_source/pik-body.png').convert('RGBA')
    # Remove the generator's oversized front neck cover, retaining mechanical
    # overlap beneath the independent helmet. Rear support is independently rigged.
    masks={
      'torso':[(650,100),(1190,100),(1280,700),(1170,900),(560,900),(605,540),(615,320)],
      'rear-support':[(1210,390),(1672,390),(1672,900),(1130,900),(1140,670)]}
    crops={}
    for id,points in masks.items():
        mask=Image.new('L',source.size);ImageDraw.Draw(mask).polygon(points,fill=255)
        out=source.copy();out.putalpha(ImageChops.multiply(out.getchannel('A'),mask))
        bbox=out.getbbox();out=out.crop(bbox);out.save(d/'rig'/f'{id}.png');crops[id]=list(bbox)
    write(d/'rig/body-cuts.json',{'source':'../_source/pik-body.png','polygons':masks,'cropBoxes':crops})
    layers=[layer('background','background.png',[0,0,1672,941],0,'background','Цельный фон диспетчерской')]
    for i,x in enumerate([558,780,983],1):
        layers.append(fitted(f'dock-{i}','charge-dock.png',[x,459,184,155],30,f'Зарядная ячейка {i}',interactive=True))
        a=layer(f'dock-light-{i}','../shared/dock-charged.png',[x+10,524,164,75],32,label=f'Ячейка {i}: заряд',state='charged');a['motion']='flicker';layers.append(a)
        layers.append(layer(f'dock-number-{i}',f'../shared/digit-{i}.png',[x+69,573,24,30],33,label=f'Номер ячейки {i}'))
    for i,x in enumerate([556,783,1008],1):
        a=layer(f'capsule-reflection-{i}','../shared/floor-glow.png',[x-18,791,190,87],40,label=f'Капсула {i}: свет на полу');a['motion']='flicker';layers.append(a)
        layers.append(fitted(f'capsule-{i}','energy-capsule.png',[x,761,157,74],70,f'Энергокапсула {i}',interactive=True))
    rig={
      'id':'pik','position':[1120,405],'z':60,'canvas':[500,300],'brightness':0.67,
      'notes':'2D puppet in the original view. Positions are relative to parent pivots, in scene pixels. Angles are local clockwise degrees. Every part has real PNG alpha.',
      'nodes':[
        {'id':'rear-support','file':'rig/rear-support.png','position':[330,176],'width':145,'height':84,'pivot':[.2,.45],'z':5,'angle':0,'limits':[-3,3]},
        {'id':'torso','file':'rig/torso.png','position':[257,145],'width':157,'height':158,'pivot':[.5,.5],'z':20,'angle':0,'limits':[-3,3]},
        {'id':'head','file':'pik-head.png','position':[211,218],'width':178,'height':178,'pivot':[.6778,.9011],'z':30,'angle':0,'limits':[-12,15],
         'children':[
           {'id':'antenna','file':'pik-antenna.png','position':[-64,-143],'width':54,'height':64,'pivot':[.53,.91],'z':-1,'angle':0,'limits':[-10,10]},
           {'id':'eye','file':'../shared/eye-awake.png','position':[-57,-58],'width':52,'height':52,'pivot':[.5,.5],'z':1,'angle':0,'motion':'flicker'}
         ]}
      ]}
    arms=json.loads((d/'rig/rig-arms.json').read_text())
    for side,position,scale,z in [('near',[239,191],.12,40),('far',[146,186],.11,10)]:
        chain=[p for p in arms['parts'] if f'arm-{side}-' in p['id']]
        nodes=[]
        labels=['плечевая часть','предплечье','кисть']
        for i,part in enumerate(chain):
            crop=part['sourceCrop'];pivot=part['pivotLocal'];ps=part['pivotSource']
            pos=position if i==0 else [(ps[k]-chain[i-1]['pivotSource'][k])*scale for k in range(2)]
            node={'id':part['id'],'label':('Ближняя рука: ' if side=='near' else 'Дальняя рука: ')+labels[i],
                  'file':'rig/'+part['file'],'position':pos,'width':crop[2]*scale,'height':crop[3]*scale,
                  'pivot':[pivot[0]/crop[2],pivot[1]/crop[3]],'angle':20 if i==0 else 0,
                  'z':z if i==0 else i,'limits':part['rotationLimits'],'parent':part['parent'],'children':[]}
            if nodes:nodes[-1]['children'].append(node)
            nodes.append(node)
        rig['nodes'].append(nodes[0])
    torso=next(n for n in rig['nodes'] if n['id']=='torso')
    torso['children']=[]
    for child in rig['nodes']:
        if child is torso:continue
        child['position']=[child['position'][k]-torso['position'][k] for k in range(2)]
        child['z']-=torso['z'];child['parent']='torso';torso['children'].append(child)
    rig['nodes']=[torso]
    write(d/'pik-rig.json',rig)
    mf={'id':'04-dispatch','title':'Диспетчерская — пробуждение Пика','reference':'../../../шаблоны сцен/Codex Image Sep 7, 2026, 07_50_38 PM.png',
        'canvas':{'width':1672,'height':941},'layers':layers,'puppets':[{'file':'pik-rig.json'}],
        'notes':'Доки и капсулы используют один мастер PNG каждый. Номера, свечение и персонаж отдельны. Три части каждой руки подключаются из rig/rig-arms.json.'}
    write(d/'manifest.json',mf)

def add_ui():
    for name in SCENES:
        mf=ROOT/name/'manifest.json';data=json.loads(mf.read_text());data['layers']=[x for x in data['layers'] if not x.get('uiGenerated')]
        def ui(id,x,y,w,h,z=100,motion='none',**extra):
            a=layer('ui-'+id,'../shared/'+id+'.png',[x,y,w,h],z,'ui',id,uiGenerated=True)
            a['motion']=motion;a.update(extra);data['layers'].append(a)
        if name=='01-menu':
            ui('decor-discovery',48,111,200,147,90,rotation=-6)
            ui('decor-math',1486,530,178,143,90,rotation=-8)
            ui('decor-stories',1511,769,147,117,90,rotation=-5)
            ui('logo',526,217,620,258)
            ui('label-tagline',567,452,540,24)
            ui('button-primary-normal',586,513,500,112)
            ui('icon-star',630,541,56,56,101)
            ui('label-start',695,543,340,48,101)
            ui('button-secondary-normal',661,628,350,80)
            ui('icon-play',729,650,36,36,101)
            ui('label-continue',778,646,215,46,101)
            ui('label-restart',741,718,190,40)
            ui('icon-sound',1579,19,72,72)
        if name=='02-map':
            ui('decor-discovery',28,266,178,137,90,rotation=-7)
            ui('decor-knowledge',70,654,100,139,90,rotation=-7)
            ui('decor-more',1557,497,91,99,42,rotation=-3)
            ui('decor-together',1532,787,84,76,51,rotation=8)
            ui('logo',37,29,390,162)
            ui('label-map',55,190,350,30)
            ui('icon-sound',1579,19,72,72)
            ui('route-left',611,405,140,70,24,motion='flicker')
            ui('route-right',999,426,111,53,24,motion='flicker')
            ui('map-marker',467,269,80,100,40,motion='float')
            for i,(x,title,sub) in enumerate([(366,'dispatch','dispatch'),(742,'technical','technical'),(1120,'beacon','beacon')]):
                ui('map-card-'+('active' if i==0 else 'locked'),x,505,260,86,40)
                # Reused files need distinct layer IDs.
                data['layers'][-1]['id']+='-'+str(i)
                ui('label-'+title,x+8,520,244,30,41)
                ui('label-'+sub+'-sub',x+8,549,244,28,41)
                if i:
                    ui('icon-lock',x+112,572,32,37,42);data['layers'][-1]['id']+='-'+str(i)
            ui('button-primary-normal',586,704,500,112)
            ui('icon-radio',644,739,56,56,101)
            ui('label-signal',722,742,340,48,101)
            ui('monitor-orbits',1388,705,166,156,50,rotation=8)
        if name in ['03-approach','04-dispatch']:
            ui('icon-pause',19,18,72,72)
            ui('icon-backpack',1579,18,72,72)
        if name=='03-approach':
            ui('signal-rings',1030,288,320,320,80,motion='signal')
            ui('signal-core',1120,378,140,140,81,motion='flicker')
            ui('signal-pointer',1184,442,340,132,82)
            ui('label-touch-signal',1288,521,256,42,83)
        if name=='04-dispatch':
            ui('monitor-orbits',102,133,217,184,15,rotation=4)
            ui('monitor-status',347,159,211,170,15,rotation=4)
        data['status']='ready'
        data['renderNotes']='x/y/width/height describe the full PNG rectangle in 1672×941 scene coordinates. pivot is normalized to the PNG. rotation is clockwise degrees. All renderable images are PNG. UI files are separately reusable.'
        write(mf,data)

if __name__=='__main__':
    build_dispatch();add_ui()
