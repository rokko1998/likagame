import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import{fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1200},deviceScaleFactor:1});
const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(r.status()+' '+r.url())});
await page.goto(process.argv[2]||'http://127.0.0.1:4187/assets/scene-kit-v1/review/');
await page.waitForFunction(()=>document.getElementById('loading').style.display==='none');
async function png(){return await page.evaluate(()=>document.getElementById('stage').toDataURL('image/png'))}
async function save(name){await fs.writeFile(path.join(root,'review',name),Buffer.from((await png()).split(',')[1],'base64'))}
for(let i=0;i<4;i++){
 await page.evaluate(i=>window.chooseScene(i),i);
 const loaded=await page.locator('#loading').evaluate(e=>e.style.display==='none');
 if(!loaded)throw new Error('Scene '+i+' did not load');
 await save(`scene-0${i+1}-assembled.png`);
 const normal=await png();await page.locator('#original').click();const original=await png();
 if(normal===original)throw new Error('Reference comparison failed for scene '+i);
 await page.locator('#original').click();
 checks.push({scene:i+1,loaded:true,originalComparison:true});
}
const before=await png();await page.locator('#bend').fill('1');await page.locator('#head').fill('12');
if(before===await png())throw new Error('Puppet pose did not change');
await page.locator('#joints').check();await save('scene-04-bent.png');checks.push({puppetBendAndHead:true});
await page.locator('#reset-pose').click();await page.locator('#joints').uncheck();
await page.locator('#charged').check();if(before===await png())throw new Error('Charged state did not change');
await page.locator('#charged').uncheck();checks.push({chargedState:true});
await page.locator('.asset-card').nth(1).click();await page.locator('#only').check();await page.locator('#backdrop').selectOption('light');
if(before===await png())throw new Error('Isolation did not change');checks.push({layerIsolationAndBackdrop:true});
await page.locator('#show-all').click();await page.locator('#backdrop').selectOption('scene');
await page.evaluate(()=>window.chooseScene(2));await page.locator('#animate').check();const animationA=await png();await page.waitForTimeout(250);const animationB=await png();if(animationA===animationB)throw new Error('Animation is static');checks.push({animation:true});
await page.locator('#animate').uncheck();await page.evaluate(()=>window.chooseScene(3));
await page.screenshot({path:path.join(root,'review/viewer-qa.png'),fullPage:false});
const report={pass:!errors.length,errors,checks};await fs.writeFile(path.join(root,'review/browser-report.json'),JSON.stringify(report,null,2)+'\n');
await browser.close();console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
