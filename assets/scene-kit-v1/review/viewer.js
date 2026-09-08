/* Local artifact viewer; no network requests except local PNGs. */
const $=id=>document.getElementById(id),canvas=$('stage'),ctx=canvas.getContext('2d');
const cache=new Map(),hidden=new Set();let current=0,selected=null,compare=false,ready=false;
const parts=n=>[n,...(n.children||[]).flatMap(parts)];
const allLayers=s=>[...s.layers,...(s.puppets||[]).flatMap(p=>p.data.nodes.flatMap(parts).map(n=>({...n,puppet:true,label:n.label||n.id,file:n.file,z:p.data.z+(n.z||0)})))];
const pathFor=(s,file)=>'../'+s.id+'/'+file;
function img(path){return cache.get(path)}
function load(path){if(cache.has(path))return Promise.resolve();return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{cache.set(path,im);resolve()};im.onerror=()=>reject(new Error('Не удалось загрузить '+path));im.src=path;});}
function scene(){return KIT.scenes[current]}
async function chooseScene(i){
 current=i;selected=null;compare=false;hidden.clear();ready=false;$('loading').style.display='grid';
 const s=scene();$('title').textContent=s.title;$('subtitle').textContent='Экран '+(i+1)+' / 4 · сборка из независимых PNG';
 $('pose').hidden=i!==3;$('bend').value=0;$('head').value=0;$('original').classList.remove('active');
 [...$('scenes').children].forEach((b,j)=>b.classList.toggle('active',j===i));
 try{await Promise.all([...new Set(allLayers(s).map(l=>pathFor(s,l.file)).concat([pathFor(s,s.reference)]))].map(load));ready=true;$('loading').style.display='none';buildLists();render(0);}catch(e){$('loading').textContent=e.message;console.error(e)}
}
function select(l){selected=l.id;buildLists();const im=img(pathFor(scene(),l.file));$('asset-preview').replaceChildren(Object.assign(document.createElement('img'),{src:im.src,alt:l.label||l.id}));$('selected-title').textContent=l.label||l.id;$('selected-notes').textContent=`${im.naturalWidth} × ${im.naturalHeight} px · PNG. `+(l.notes||(l.puppet?'Независимая часть рига; движение наследуется от родительского сустава.':'Отдельный слой с собственной прозрачностью.'));$('selected-link').hidden=false;$('selected-link').href=im.src;render(0)}
function buildLists(){
 const s=scene(),ls=allLayers(s);$('layers').replaceChildren();
 for(const l of [...ls].sort((a,b)=>b.z-a.z)){
  const row=document.createElement('div');row.className='layer'+(selected===l.id?' selected':'');row.title=l.file;
  const check=Object.assign(document.createElement('input'),{type:'checkbox',checked:!hidden.has(l.id)});check.onclick=e=>e.stopPropagation();check.onchange=()=>{check.checked?hidden.delete(l.id):hidden.add(l.id);render(0)};
  const text=document.createElement('span');text.textContent=l.label||l.id;const type=document.createElement('small');type.textContent=l.kind==='background'?'ФОН':l.puppet?'РИГ':'PNG';row.append(check,text,type);row.onclick=()=>select(l);$('layers').append(row);
 }
 $('assets').replaceChildren();const unique=[...new Map(ls.map(l=>[l.file,l])).values()];
 for(const l of unique){const b=document.createElement('button');b.className='asset-card'+(selected===l.id?' selected':'');b.title=l.file;const thumb=document.createElement('div');thumb.className='thumb';thumb.append(Object.assign(document.createElement('img'),{src:pathFor(s,l.file),alt:l.label||l.id,loading:'lazy'}));const text=document.createElement('span');text.textContent=l.file.split('/').at(-1);b.append(thumb,text);b.onclick=()=>select(l);$('assets').append(b);}
 $('asset-count').textContent=unique.length+' уникальных PNG';$('status').textContent=ls.length+' слоёв · оригинальные превью сохранены';
}
const rad=d=>d*Math.PI/180;
function drawJoint(){ctx.save();ctx.strokeStyle='#72e6c1';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.moveTo(-10,0);ctx.lineTo(10,0);ctx.moveTo(0,-10);ctx.lineTo(0,10);ctx.stroke();ctx.restore()}
function visible(l){return !hidden.has(l.id)&&(!$('only').checked||!selected||selected===l.id)}
function drawLayer(s,l,t){
 if(!visible(l))return;if(l.kind==='background'&&$('backdrop').value!=='scene')return;if(l.state==='charged'&&!$('charged').checked&&!($('only').checked&&selected===l.id))return;
 const im=img(pathFor(s,l.file));if(!im)return;ctx.save();
 let dy=0,rot=l.rotation||0,sx=1,alpha=l.opacity??1;
 if($('animate').checked){
  if(l.rig==='ship-rig')dy=Math.sin(t*.0012)*5;
  else if(l.motion==='float')dy=Math.sin(t*.0012)*3;
  if(l.motion==='sway')rot+=Math.sin(t*.0008)*1.3;
  if(l.motion==='thruster')sx=1+Math.sin(t*.014)*.06;
  if(l.motion==='flicker')alpha*=.85+Math.sin(t*.0025)*.15;
  if(l.motion==='signal'){sx=1+Math.sin(t*.0014)*.035;alpha*=.85+Math.sin(t*.0014)*.15;}
 }
 const px=l.pivot?.[0]??.5,py=l.pivot?.[1]??.5;
 ctx.translate(l.x+px*l.width,l.y+py*l.height+dy);ctx.rotate(rad(rot));ctx.scale(sx,1);ctx.globalAlpha=alpha;
 ctx.drawImage(im,-px*l.width,-py*l.height,l.width,l.height);
 if($('joints').checked&&l.kind!=='background'&&l.kind!=='ui')drawJoint();
 if(selected===l.id&&!compare){ctx.strokeStyle='#f8d58c';ctx.lineWidth=1;ctx.setLineDash([5,5]);ctx.strokeRect(-px*l.width,-py*l.height,l.width,l.height)}
 ctx.restore();
}
function drawPuppet(s,p,t){
 const rig=p.data;ctx.save();ctx.translate(...rig.position);
 function node(n){
  ctx.save();ctx.translate(...n.position);let angle=n.angle||0;
  const bend=Number($('bend').value);
  if(n.id==='head')angle+=Number($('head').value);
  if(n.id.includes('forearm'))angle+=bend*(n.id.includes('near')?-20:18);
  if(n.id.includes('hand'))angle+=bend*(n.id.includes('near')?16:-14);
  if($('animate').checked){if(n.id==='antenna')angle+=Math.sin(t*.002)*2;if(n.id==='head')angle+=Math.sin(t*.001)*1.2;}
  ctx.rotate(rad(angle));
  for(const child of (n.children||[]).filter(x=>(x.z||0)<0))node(child);
  if(visible(n)){
   const im=img(pathFor(s,n.file));if(im){if(n.motion==='flicker'&&$('animate').checked)ctx.globalAlpha=.85+Math.sin(t*.002)*.15;ctx.filter=n.id==='eye'?'none':`brightness(${rig.brightness??1})`;ctx.drawImage(im,-n.pivot[0]*n.width,-n.pivot[1]*n.height,n.width,n.height);ctx.globalAlpha=1;ctx.filter='none';}
   if($('joints').checked)drawJoint();
  }
  for(const child of (n.children||[]).filter(x=>(x.z||0)>=0))node(child);
  ctx.restore();
 }
 for(const n of [...rig.nodes].sort((a,b)=>a.z-b.z))node(n);ctx.restore();
}
function render(t){
 if(!ready)return;const s=scene();ctx.clearRect(0,0,1672,941);
 const bg=$('backdrop').value;ctx.fillStyle=bg==='light'?'#eeeef0':'#152238';ctx.fillRect(0,0,1672,941);
 if(bg==='checker'){for(let y=0;y<941;y+=28)for(let x=0;x<1672;x+=28){ctx.fillStyle=((x/28+y/28)%2)?'#d2d8e1':'#eef0f5';ctx.fillRect(x,y,28,28)}}
 if(compare){ctx.drawImage(img(pathFor(s,s.reference)),0,0,1672,941);return;}
 const items=[...s.layers.map(l=>({z:l.z,draw:()=>drawLayer(s,l,t)})),...(s.puppets||[]).map(p=>({z:p.data.z,draw:()=>drawPuppet(s,p,t)}))];
 items.sort((a,b)=>a.z-b.z).forEach(x=>x.draw());
}
KIT.scenes.forEach((s,i)=>{const b=document.createElement('button');b.textContent=['01 · Меню','02 · Карта','03 · Сигнал','04 · Пик'][i];b.onclick=()=>chooseScene(i);$('scenes').append(b)});
$('original').onclick=()=>{compare=!compare;$('original').classList.toggle('active',compare);render(0)};
$('show-all').onclick=()=>{hidden.clear();$('only').checked=false;buildLists();render(0)};
$('reset-pose').onclick=()=>{$('bend').value=0;$('head').value=0;render(0)};
for(const id of ['animate','joints','only','backdrop','bend','head','charged'])$(id).oninput=()=>render(0);
$('download').onclick=()=>{try{const a=document.createElement('a');a.download=scene().id+'-assembly.png';a.href=canvas.toDataURL('image/png');a.click()}catch(e){alert('Для экспорта откройте просмотрщик через локальный HTTP-сервер из README.')}};
function loop(t){if($('animate').checked)render(t);requestAnimationFrame(loop)}requestAnimationFrame(loop);
window.chooseScene=chooseScene;window.renderScene=render;
chooseScene(Number(new URLSearchParams(location.search).get('scene'))||0);
