// Fixed acceptance tests. Product implementation must not modify this file.
const {chromium}=require('C:/Users/Editor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),reference=process.argv.includes('--reference');
const cases=[['desktop','light','Default',1440,900],['desktop','dark','Default',1440,900],['mobile','light','Default',375,812],['mobile','dark','Default',375,812],['desktop','light','Empty',1440,900]];
(async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204).end();return;}let file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/plain');res.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 let browser;const results=[];
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  for(const [viewport,theme,state,width,height]of cases){
   const id=`counter-${viewport}-${theme}-${state.toLowerCase()}`,page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});await page.emulateMedia({colorScheme:theme});
   const file=reference?'/.project-init/counter-reference.html':'/src/index.html';
   await page.goto(`${base}${file}?capture=1&screen=counter&theme=${theme}&viewport=${viewport}&state=${state}`,{waitUntil:'networkidle'});
   if(!reference&&state==='Default'){
    const value=page.getByTestId('count');await value.waitFor();assert.equal(await value.innerText(),'0');
    const increment=page.getByRole('button',{name:'Increment',exact:true}),reset=page.getByRole('button',{name:'Reset',exact:true});
    assert.equal(await increment.evaluate(el=>el.tagName),'BUTTON');assert.equal(await reset.evaluate(el=>el.tagName),'BUTTON');assert.ok(await page.getByRole('heading',{name:'Counter',exact:true}).isVisible());assert.ok(await value.evaluate(el=>!!el.closest('[aria-live="polite"]')),'Polite live region');
    await increment.click();assert.equal(await value.innerText(),'1');assert.equal(await page.locator('.empty-state').isVisible(),false);await increment.click();assert.equal(await value.innerText(),'2');await increment.click();assert.equal(await value.innerText(),'3');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);fs.mkdirSync(path.join(root,'.project-init','positive'),{recursive:true});await page.screenshot({path:path.join(root,'.project-init','positive',`${id}.png`)});await reset.click();assert.equal(await value.innerText(),'0');await reset.click();assert.equal(await value.innerText(),'0');
    await increment.focus();await page.keyboard.press('Enter');assert.equal(await value.innerText(),'1');await page.keyboard.press('Space');assert.equal(await value.innerText(),'2');await reset.click();assert.equal(await value.innerText(),'0');
    await increment.click();await page.reload({waitUntil:'networkidle'});assert.equal(await value.innerText(),'0');assert.equal(await page.locator('.empty-state').isVisible(),true);
    for(const control of [increment,reset]){const box=await control.boundingBox();assert.ok(box.width>=44&&box.height>=44,'Control touch target at least 44px');}
    await page.keyboard.press('Tab');let tries=0;while(!(await increment.evaluate(el=>el===document.activeElement))&&tries++<8)await page.keyboard.press('Tab');assert.ok(await increment.evaluate(el=>el===document.activeElement),'Increment reachable with Tab');
    assert.ok(await increment.evaluate(el=>{const s=getComputedStyle(el);return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0||s.boxShadow!=='none';}),'Visible keyboard focus');await page.keyboard.press('Enter');assert.equal(await value.innerText(),'1');await page.keyboard.press('Tab');assert.ok(await reset.evaluate(el=>el===document.activeElement));await page.keyboard.press('Enter');assert.equal(await value.innerText(),'0');await increment.click();await reset.focus();await page.keyboard.press('Space');assert.equal(await value.innerText(),'0');
    // Remove the explicit theme query before testing the system preference.
    await page.goto(`${base}/src/index.html`,{waitUntil:'networkidle'});
    assert.equal(await page.locator('html').getAttribute('data-theme'),null);
    const initialBackground=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor);
    await page.emulateMedia({colorScheme:theme==='light'?'dark':'light'});
    const changedBackground=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor);
    assert.notEqual(changedBackground,initialBackground,'System theme changes the rendered background');
    await page.emulateMedia({colorScheme:theme});
    assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),initialBackground);
    await page.evaluate(()=>document.documentElement.style.zoom='2');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'200% CSS zoom reflow proxy');await increment.scrollIntoViewIfNeeded();await increment.click();assert.equal(await value.innerText(),'1');await reset.scrollIntoViewIfNeeded();await reset.click();await page.evaluate(()=>document.documentElement.style.zoom='');
   }
   assert.equal(await page.getByTestId('count').innerText(),'0');assert.equal(await page.locator('.empty-state').innerText(),'No increments yet.');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`No overflow ${id}`);
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   const side=reference?'baselines':'actual',target=path.join(root,'.project-init','visual',side,`${id}.png`);fs.mkdirSync(path.dirname(target),{recursive:true});
   await page.locator('body').click({position:{x:1,y:1}});await page.mouse.move(1,1);await page.screenshot({path:target});
   results.push({id,width,height,state,behaviorChecked:!reference&&state==='Default',noOverflow:true,noRuntimeErrors:true,noExternalRequests:true});await page.close();
  }
  fs.writeFileSync(path.join(root,'.project-init',reference?'reference-browser-results.json':'browser-results.json'),JSON.stringify({browserVersion:browser.version(),reference,results,passed:true},null,2));
  console.log(JSON.stringify({passed:true,reference,cases:results.length,browserVersion:browser.version(),checks:reference?'design captures':'0/1/2/3, Reset, both buttons Enter/Space, Tab/focus, reload from positive, positive captures, CSS zoom proxy, Empty state, overflow/errors/external requests on four default variants'},null,2));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
