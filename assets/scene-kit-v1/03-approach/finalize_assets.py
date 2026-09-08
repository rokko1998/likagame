"""Reproducible scene data, chroma matte for the generated exhaust, and QA.
The existing correct ship/radar alpha files are read without modification.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

DIR=Path(__file__).resolve().parent
GEN=Path('/Users/sheva/.codex/generated_images/01a07db3-10d4-72f0-a907-2ad8f3fb5fb8')
SOURCE=GEN/'exec-7b568153-2d72-4504-87db-e614ba5991b6.png'
# Neutral checker colors have no warm chroma. Use that property only on the
# light effect; unlike a global white key this does not touch mechanical parts.
rgb=np.asarray(Image.open(SOURCE).convert('RGB')).astype(np.float32)
r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
h,w=r.shape
warm=np.maximum(r-b-4,0)
a=np.clip(warm/165,0,1)**.85
# Rebuild the small neutral-white ignition core inside its observed silhouette.
# This limited known interior region cannot select white checker squares.
y,x=np.mgrid[:h,:w]
core=np.exp(-(((x-1982)/43)**2+((y-171)/22)**2)*1.7)
core*= (x>1820)&(x<2040)&(y>110)&(y<224)
# Restore only the observed neutral-white interior, bounded by its warm rim.
# Coordinates are measured from the 2137x736 source; feathering preserves glow.
core_shape=Image.new('L',(w,h),0)
ImageDraw.Draw(core_shape).polygon([(1750,212),(1850,186),(1930,171),(1988,144),(2003,144),(2017,164),(2017,181),(2006,188),(1940,198),(1830,219)],fill=255)
interior=np.asarray(core_shape.filter(ImageFilter.GaussianBlur(3))).astype('float32')/255
core=np.maximum(core,interior)
a=np.maximum(a,core)
a[a<.014]=0
# Recover warm premultiplied color from the neutral backdrop, then unpremultiply.
# R stays warm white; G/B track source hue after background contribution removal.
alpha=np.maximum(a,.001)
out=np.empty_like(rgb)
out[:,:,0]=255
out[:,:,1]=np.clip((g-(1-alpha)*250)/alpha,70,255)
out[:,:,2]=np.clip((b-(1-alpha)*250)/alpha,10,235)
wh=np.clip(core/.6,0,1)
out=out*(1-wh[:,:,None])+np.array([255,250,220])*(wh[:,:,None])
rgba=np.dstack((out,np.rint(a*255))).astype('uint8')
rgba[a==0,:3]=0
Image.fromarray(rgba).save(DIR/'thruster.png')

manifest={
 'id':'03-approach','title':'Подлёт к сигналу',
 'reference':'../../../шаблоны сцен/Codex Image Sep 7, 2026, 07_50_27 PM.png',
 'canvas':{'width':1672,'height':941},'status':'ready',
 'layers':[
  {'id':'background','file':'background.png','label':'Цельный фон: станция и окружение','kind':'background','x':0,'y':0,'width':1672,'height':941,'z':0,'pivot':[.5,.5],'motion':'none','notes':'Статичная станция, облака, небо, луна и острова в одном фоне. Без корабля, радара, пламени, сигнала и UI.'},
  {'id':'radar','file':'radar.png','label':'Радар','kind':'sprite','x':1176,'y':106,'width':190,'height':164.61,'z':10,'pivot':[.416,.963],'motion':'sway','notes':'Основание в [1255.04,264.52]. Допустимо качание в плоскости ±3°. Для 3D-разворота нужны дополнительные ракурсы.'},
  {'id':'ship','file':'ship.png','label':'Корпус корабля','kind':'sprite','x':106,'y':459,'width':430,'height':322.5,'z':30,'pivot':[.55,.55],'motion':'float','rig':'ship-rig','notes':'Два сопла входят в корпус, пламя отдельно. Двигать корабль и оба пламени одним rig. Исходный alpha PNG сохранён без изменений.'},
  {'id':'thruster-upper','file':'thruster.png','label':'Пламя верхнего двигателя','kind':'sprite','x':-65.74,'y':593.00,'width':230,'height':79.21,'z':31,'pivot':[.931,.2323],'motion':'thruster','rig':'ship-rig','notes':'Экземпляр одного мастер-ассета. Источник пламени у [148.39,611.40]. Масштабировать вдоль оси от сопла, не по центру.'},
  {'id':'thruster-lower','file':'thruster.png','label':'Пламя нижнего двигателя','kind':'sprite','x':-5.66,'y':632.08,'width':290,'height':99.88,'z':31,'pivot':[.931,.2323],'motion':'thruster','rig':'ship-rig','notes':'Второй экземпляр thruster.png. Источник у [264.33,655.28]. Общая трансформация с ship; индивидуальный пульс длины ±8%.'},
 ],
 'rigs':{'ship-rig':{'parent':None,'members':['ship','thruster-upper','thruster-lower'],'pivot':[342.5,636.38],'coordinateSpace':'canvas','translationAmplitude':[4,5],'rotationDegrees':1}},
 'uiAnchors':{'signalCenter':[1190,448],'pauseCenter':[55,55],'backpackCenter':[1615,55],'signalLabelAnchor':[1295,541]},
 'limitations':['Скрытые части объектов восстановлены генератором, поэтому набор не является побитовым вырезанием исходного превью.','Пламя восстановлено из RGB-генерации локальной цветовой маской; нейтрально-белое ядро реконструировано внутри видимого огня.','Сигнал, UI и пульсирующие огни станции подключаются общими слоями набора.']
}
(DIR/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(DIR/'assembly-plan.json').write_text(json.dumps({'note':'Проверенные координаты сборки. Источник истины — manifest.json. Размеры PNG сохраняют исходные пропорции.','rigs':manifest['rigs'],'ui':manifest['uiAnchors'],'attachmentPoints':{'radarMount':[1255.04,264.52],'upperNozzle':[148.39,611.40],'lowerNozzle':[264.33,655.28]},'motion':{'ship':'±4 px X / ±5 px Y, небольшой общий наклон ±1° для корпуса и огня','radar':'±3° вокруг нижней опоры','thruster':'scaleX 0.92..1.08 от источника; opacity 0.80..1'}} ,ensure_ascii=False,indent=2)+'\n')

prompts=json.loads((DIR/'prompts.json').read_text())
short='Remove the background from this image. Preserve the single mechanical object exactly. Deliver the isolated object as a PNG with a transparent background. Remove the entire light checked backdrop; keep all object edges, holes, fine details and interior colors intact. No other changes.'
prompts['successfulAlphaEdit']={'ship':short,'radar':short}
prompts['localPostprocessing']={'thruster':'finalize_assets.py: chroma matte of RGB exhaust, unmatting against neutral light checker, reconstruction of small white ignition core. Explicitly authorized by user.','ship':'None. Correct alpha PNG copied unchanged.','radar':'None. Correct alpha PNG copied unchanged.'}
(DIR/'prompts.json').write_text(json.dumps(prompts,ensure_ascii=False,indent=2)+'\n')
idx=json.loads((DIR/'source-index.json').read_text())
for k,f in [('ship','exec-9ef4a8d5-22e0-4406-9ea1-1e5de9a84748.png'),('radar','exec-78fd6fda-4ea0-4ea5-b03e-de52be4713e1.png')]:
 idx[k]['successfulAlphaEdit']=str(GEN/f);idx[k]['acceptedFile']=k+'.png'
idx['thruster']['acceptedFile']='thruster.png';idx['thruster']['localProcessing']='finalize_assets.py'
idx['final-background']['acceptedFile']='background.png'
(DIR/'source-index.json').write_text(json.dumps(idx,ensure_ascii=False,indent=2)+'\n')

qa=DIR/'qa';qa.mkdir(exist_ok=True)
canvas=Image.open(DIR/'background.png').convert('RGBA')
for L in sorted(manifest['layers'][1:],key=lambda l:l['z']):
 im=Image.open(DIR/L['file']).convert('RGBA').resize((round(L['width']),round(L['height'])),Image.Resampling.LANCZOS)
 canvas.alpha_composite(im,(round(L['x']),round(L['y'])))
canvas.convert('RGB').save(qa/'composition.png')
report={}
for name in ['ship.png','radar.png','thruster.png']:
 im=Image.open(DIR/name).convert('RGBA');alpha=np.array(im)[:,:,3]
 report[name]={'mode':im.mode,'size':im.size,'alphaMin':int(alpha.min()),'alphaMax':int(alpha.max()),'transparentPixels':int((alpha==0).sum()),'partialPixels':int(((alpha>0)&(alpha<255)).sum()),'visibleBounds':Image.fromarray((alpha>127).astype('uint8')*255).getbbox(),'verifiedOn':['#101b32','#f5f1e8']}
 panels=Image.new('RGB',(1200,500));d=ImageDraw.Draw(panels)
 for i,col in enumerate(['#101b32','#f5f1e8']):
  panels.paste(col,(i*600,0,(i+1)*600,500));thumb=im.copy();thumb.thumbnail((570,450),Image.Resampling.LANCZOS)
  panels.paste(thumb,(i*600+(600-thumb.width)//2,(500-thumb.height)//2),thumb)
  d.text((i*600+16,14),name+' | '+col,fill='#9fa8b6' if i==0 else '#33425c')
 panels.save(qa/(name.removesuffix('.png')+'-dark-light.jpg'),quality=95)
(qa/'alpha-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
