// Code-native UI artwork, exported to real transparent PNG (2×).
// Run from repository root: node assets/scene-kit-v1/tools/build_ui.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'shared');
await fs.mkdir(path.join(dir,'source'),{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({deviceScaleFactor:2});
const inventory=[];
const defs=`<defs>
 <linearGradient id="gold" x2="0" y2="1"><stop stop-color="#fff0b6"/><stop offset=".4" stop-color="#ffd57b"/><stop offset="1" stop-color="#e9ad50"/></linearGradient>
 <linearGradient id="ice" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset=".55" stop-color="#effaff"/><stop offset="1" stop-color="#91b7de"/></linearGradient>
 <linearGradient id="blue" x2="0" y2="1"><stop stop-color="#283e5ddd"/><stop offset="1" stop-color="#14233be6"/></linearGradient>
 <radialGradient id="glow"><stop stop-color="#fffbd5"/><stop offset=".12" stop-color="#ffd16b" stop-opacity=".85"/><stop offset=".4" stop-color="#ff9b43" stop-opacity=".35"/><stop offset="1" stop-color="#ff761f" stop-opacity="0"/></radialGradient>
 <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
 </defs>`;
async function emit(name,w,h,body){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${body}</svg>`;
 await fs.writeFile(path.join(dir,'source',name+'.svg'),svg);
 await page.setViewportSize({width:w,height:h});
 await page.setContent('<html><style>html,body{margin:0;background:transparent}svg{display:block}</style>'+svg+'</html>');
 await page.screenshot({path:path.join(dir,name+'.png'),omitBackground:true});
 inventory.push({id:name,file:name+'.png',width:w*2,height:h*2,logicalSize:[w,h],kind:'ui',source:'source/'+name+'.svg'});
}
const star=(cx,cy,r,color)=>`<path d="M${cx} ${cy-r} L${cx+r*.2} ${cy-r*.22} L${cx+r} ${cy} L${cx+r*.2} ${cy+r*.22} L${cx} ${cy+r} L${cx-r*.2} ${cy+r*.22} L${cx-r} ${cy} L${cx-r*.2} ${cy-r*.22}Z" fill="${color}"/>`;
const chamfer=(x,y,w,h,c=14)=>`M${x+c} ${y}H${x+w-c}L${x+w} ${y+c}V${y+h-c}L${x+w-c} ${y+h}H${x+c}L${x} ${y+h-c}V${y+c}Z`;
for(const state of ['normal','hover','pressed','disabled']){
 let fill=state==='disabled'?'#596577':state==='pressed'?'#dca149':'url(#gold)';
 await emit('button-primary-'+state,500,112,`<path d="${chamfer(16,18,468,78)}" fill="#ffbb53" opacity="${state==='hover'?.65:.35}" filter="url(#soft)"/><path d="${chamfer(16,18,468,78)}" fill="${fill}" stroke="#ffc976" stroke-width="2"/><path d="${chamfer(20,22,460,70,12)}" fill="none" stroke="#fff3c5" stroke-width="1.4" opacity=".95"/><path d="M26 39V29H39M461 29H472V40M26 76V85H39M461 85H472V76" fill="none" stroke="#987047" opacity=".6"/>`);
}
for(const state of ['normal','hover','pressed'])await emit('button-secondary-'+state,350,80,`<path d="${chamfer(12,12,326,56)}" fill="${state==='hover'?'#4e688ebb':state==='pressed'?'#101e33ee':'url(#blue)'}" stroke="#a4c4e8" stroke-width="1.3"/><path d="${chamfer(16,16,318,48,10)}" fill="none" stroke="#647f9d" opacity=".5"/>`);
const icons={
 pause:'<rect x="25" y="22" width="7" height="28" rx="1.6"/><rect x="41" y="22" width="7" height="28" rx="1.6"/>',
 sound:'<path d="M19 30H27L38 23V49L27 42H19Z"/><path d="M43 29Q54 36 43 44M49 24Q66 36 49 49" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
 muted:'<path d="M19 30H27L38 23V49L27 42H19Z"/><path d="M45 30L55 42M55 30L45 42" fill="none" stroke="currentColor" stroke-width="3"/>',
 backpack:'<path d="M23 24H49V53H23Z"/><path d="M30 24V19Q36 14 42 19V24M29 26V52M43 26V52M23 35H49" fill="none" stroke="#132239" stroke-width="2.7"/><path d="M30 23V19Q36 14 42 19V23" fill="none" stroke="currentColor" stroke-width="2.7"/>',
};
for(const [id,body]of Object.entries(icons))await emit('icon-'+id,72,72,`<circle cx="36" cy="36" r="31" fill="#0c1c32c9" stroke="#b5d9f7" stroke-width="1.4"/><g color="#bad9f7" fill="currentColor">${body}</g>`);
await emit('icon-star',56,56,star(28,28,23,'#102338')+'<circle cx="28" cy="28" r="6" fill="#ffdd91"/><circle cx="28" cy="28" r="2.5" fill="#172d47"/>');
await emit('icon-play',36,36,'<path d="M9 5L30 18L9 31Z" fill="#bad7f8"/>');
await emit('icon-radio',60,60,'<g fill="none" stroke="#142a42" stroke-width="3.8" stroke-linecap="round"><path d="M19 17Q7 30 19 42M13 9Q-5 30 13 50M41 17Q53 30 41 42M47 9Q65 30 47 50M30 33L22 55H38Z"/><circle cx="30" cy="29" r="5"/></g>');
await emit('icon-lock',36,42,'<rect x="7" y="18" width="22" height="21" rx="3" fill="#7a9bc5"/><path d="M11 19V13A7 7 0 0 1 25 13V19" fill="none" stroke="#7a9bc5" stroke-width="3"/><circle cx="18" cy="26" r="3" fill="#15283f"/><path d="M18 28V33" stroke="#15283f" stroke-width="2"/>');
await emit('map-marker',80,100,'<ellipse cx="40" cy="83" rx="24" ry="6" fill="#ffbb50" opacity=".8" filter="url(#soft)"/><path d="M40 77L31 56H49Z" fill="#ffdf90"/><circle cx="40" cy="34" r="28" fill="#e6ac53" opacity=".6" filter="url(#soft)"/><circle cx="40" cy="34" r="24" fill="#0e2237" stroke="#ffe4a3" stroke-width="3"/><g stroke="#c2defb" fill="none" stroke-width="2.5"><circle cx="40" cy="27" r="7"/><path d="M28 49Q27 37 40 37Q53 37 52 49M35 43V49M45 43V49"/></g>');
for(const state of ['active','locked'])await emit('map-card-'+state,280,92,`<path d="${chamfer(8,7,264,77,13)}" fill="#071426e8" stroke="${state==='active'?'#ffcd77':'#506788'}" stroke-width="1.4"/><path d="${chamfer(12,11,256,69,10)}" fill="none" stroke="${state==='active'?'#b7945a':'#1e304e'}"/>`);
await emit('logo',620,258,`<g fill="none" stroke="url(#ice)"><path d="M176 84Q307 -49 443 87" stroke-width="2.4"/><path d="M206 91Q313 11 423 107" stroke="#729fcd" stroke-width="1.3"/><path d="M56 216Q318 210 579 216" stroke-width="1.1"/></g>${star(310,31,29,'#e5f6ff')}<circle cx="418" cy="67" r="6" fill="#d6edff"/><text x="310" y="199" text-anchor="middle" font-family="Arial,sans-serif" font-size="142" font-style="italic" font-weight="1000" letter-spacing="-5" fill="url(#ice)">Маяк-7</text>`);
const texts=[
 ['label-start','Начать приключение',340,48,29,'#0e243a',700],
 ['label-continue','Продолжить',215,46,27,'#c4d9f5',500],
 ['label-restart','Начать заново',190,40,21,'#c9d6ed',400],
 ['label-signal','Ответить на сигнал',340,48,29,'#0e243a',700],
 ['label-touch-signal','Коснитесь сигнала',256,42,24,'#d4dff6',400],
 ['label-tagline','ЗНАНИЯ ОСВЕЩАЮТ НОВЫЕ МИРЫ',540,24,13,'#d3e2f5',400],
 ['label-map','КАРТА СТАНЦИИ',350,30,17,'#bdd9f8',400],
 ['label-dispatch','ДИСПЕТЧЕРСКАЯ',244,32,21,'#c2e2ff',500],
 ['label-technical','ТЕХНИЧЕСКИЙ ОТСЕК',264,32,20,'#7996bf',400],
 ['label-beacon','ЯДРО МАЯКА',244,32,21,'#7996bf',400],
 ['label-dispatch-sub','Ответь на сигнал',244,28,17,'#8db3e2',400],
 ['label-technical-sub','Почини корабль',244,28,17,'#6684b1',400],
 ['label-beacon-sub','Зажги новые миры',244,28,17,'#6684b1',400],
];
for(const [id,str,w,h,size,color,weight]of texts)await emit(id,w,h,`<text x="${w/2}" y="${h*.73}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="${id==='label-tagline'?5:id==='label-map'?7:0}" fill="${color}">${str}</text>${id==='label-restart'?`<path d="M21 38H169" stroke="${color}"/>`:''}`);
for(const [id,lines,color]of [
 ['discovery',['БОЛЬШИЕ','ОТКРЫТИЯ','НАЧИНАЮТСЯ','С ТЕБЯ'],'#afbad7'],
 ['math',['МАТЕМАТИКА','ПОМОГАЕТ','ВИДЕТЬ','ДАЛЬШЕ'],'#b6bdd8'],
 ['stories',['ЗДЕСЬ','НАЧИНАЮТСЯ','ТВОИ','ИСТОРИИ'],'#aab2cb'],
 ['knowledge',['ЗНАНИЯ','ПОМОГАЮТ','ДЕЛЬШЕ','♡'],'#49392a'],
 ['more',['ДАЛЬШЕ','ЗНАЧИТ','БОЛЬШЕ'],'#a4afd0'],
 ['together',['ВМЕСТЕ','К НОВЫМ','МИРАМ'],'#7ea4db']
 ])await emit('decor-'+id,210,160,`<g fill="${color}" opacity=".8" font-family="Chalkboard,Comic Sans MS,cursive" font-size="23" text-anchor="middle">${lines.map((s,i)=>`<text x="105" y="${28+i*29}">${s}</text>`).join('')}</g><path d="M57 143Q104 136 145 140" fill="none" stroke="${color}" opacity=".5"/>`);
for(let i=1;i<=3;i++)await emit('digit-'+i,32,38,`<text x="16" y="31" text-anchor="middle" font-family="Arial" font-size="31" font-weight="700" fill="#8793b5">${i}</text>`);
await emit('signal-core',140,140,'<circle cx="70" cy="70" r="69" fill="url(#glow)"/><circle cx="70" cy="70" r="5" fill="#fff6d2"/>');
await emit('signal-rings',320,320,'<g fill="none" stroke="#ffae68" stroke-width="1">'+[42,65,94,125].map((r,i)=>`<circle cx="160" cy="160" r="${r}" opacity="${.66-i*.13}" stroke-dasharray="${i%2?'6 3':'1 0'}"/>`).join('')+'<path d="M160 13V307M13 160H307" opacity=".32"/><path d="M58 58L78 78M242 242L262 262M58 262L78 242M242 78L262 58" opacity=".6"/></g>');
await emit('signal-pointer',340,132,'<path d="M6 7L101 96" fill="none" stroke="#c7dafa" stroke-width="1.3"/><circle cx="101" cy="96" r="3" fill="#d8e8ff"/><path d="M116 122H334" stroke="#a9bedf"/>');
await emit('route-left',166,84,'<path d="M10 12H41Q62 12 80 34L105 57H156" fill="none" stroke="#ffa02e" stroke-width="9" filter="url(#soft)"/><path d="M10 12H41Q62 12 80 34L105 57H156" fill="none" stroke="#ffe6a1" stroke-width="3.3"/><rect x="5" y="6" width="9" height="13" rx="1" fill="#ffdf8b"/><rect x="152" y="51" width="9" height="13" rx="1" fill="#ffdf8b"/>');
await emit('route-right',120,58,'<path d="M8 32H64Q72 32 79 24L86 22H112" fill="none" stroke="#ffa02e" stroke-width="9" filter="url(#soft)"/><path d="M8 32H64Q72 32 79 24L86 22H112" fill="none" stroke="#ffe6a1" stroke-width="3.3"/><rect x="4" y="26" width="8" height="12" fill="#ffdf8b"/><rect x="108" y="16" width="8" height="12" fill="#ffdf8b"/>');
await emit('eye-awake',100,100,'<circle cx="50" cy="50" r="48" fill="url(#glow)"/><ellipse cx="50" cy="50" rx="18" ry="22" fill="none" stroke="#ffc778" stroke-width="2"/><ellipse cx="50" cy="50" rx="8" ry="11" fill="#fff1bd"/>');
await emit('eye-dim',100,100,'<circle cx="50" cy="50" r="40" fill="url(#glow)" opacity=".25"/><ellipse cx="50" cy="50" rx="10" ry="12" fill="#d18b38" opacity=".7"/>');
await emit('floor-glow',240,110,'<ellipse cx="120" cy="55" rx="119" ry="53" fill="url(#glow)" opacity=".48"/>');
await emit('dock-charged',200,100,'<ellipse cx="100" cy="50" rx="93" ry="36" fill="url(#glow)" opacity=".7"/><ellipse cx="100" cy="50" rx="64" ry="15" fill="none" stroke="#ffd087" stroke-width="3"/>');
await emit('monitor-status',256,200,'<g fill="#7aaada" font-family="monospace" font-size="12" opacity=".8">'+[['СВЯЗЬ','OFFLINE'],['ЭНЕРГИЯ','НИЗКИЙ УРОВЕНЬ'],['НАВИГАЦИЯ','OFFLINE'],['КУПОЛ','OFFLINE'],['ВНЕШНИЕ ПЛАТФОРМЫ','?']].map(([a,b],i)=>`<text x="8" y="${24+i*35}">${a}</text><text x="124" y="${24+i*35}" font-size="11" fill="#7d8cab">${b}</text>`).join('')+'</g>');
await emit('monitor-orbits',240,210,'<g fill="none" stroke="#4b91ce" opacity=".8"><ellipse cx="116" cy="86" rx="86" ry="54" transform="rotate(-22 116 86)"/><ellipse cx="116" cy="86" rx="67" ry="35" transform="rotate(-30 116 86)"/><ellipse cx="116" cy="86" rx="28" ry="94" transform="rotate(58 116 86)"/><path d="M33 72L195 103M99 36L123 147" opacity=".3"/></g>'+star(141,26,12,'#74b5eb')+'<text x="116" y="186" text-anchor="middle" fill="#76a9e0" font-family="Arial" font-style="italic" font-weight="900" font-size="35">Маяк-7</text>');
await fs.writeFile(path.join(dir,'inventory.json'),JSON.stringify({mode:'native SVG → PNG with Chrome; editable sources included',assets:inventory},null,2)+'\n');
await browser.close();
console.log(`Exported ${inventory.length} transparent PNG UI assets`);
