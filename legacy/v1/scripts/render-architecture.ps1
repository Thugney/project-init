#requires -Version 5.1
<#
.SYNOPSIS
Renders an architecture JSON model as a standalone offline HTML review.
.DESCRIPTION
This is a deterministic, read-only model renderer. It does not validate the
architecture, approve decisions, execute application code or contact a service.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ModelPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [ValidateSet('untracked','changed','current','unavailable')][string]$SourceState = 'untracked',
    [string]$SourceCheckedAt = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$inputFile = (Resolve-Path -LiteralPath $ModelPath).ProviderPath
$outputFile = [System.IO.Path]::GetFullPath($OutputPath)
if ([string]::Equals($inputFile, $outputFile, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputPath must differ from ModelPath.'
}
$rawModel = [System.IO.File]::ReadAllText($inputFile)
if (-not $rawModel.TrimStart().StartsWith('{')) {
    throw 'Model must be a JSON object.'
}
$model = ConvertFrom-Json -InputObject $rawModel
if ($null -eq $model -or $model -is [System.Array] -or $model -isnot [pscustomobject]) {
    throw 'Model must be a JSON object.'
}
# Preserve the original JSON rather than coercing numbers or changing its depth.
# Escape HTML parser delimiters, including any closing script tag inside a label.
$safeModel = $rawModel.Replace('&', '\u0026').Replace('<', '\u003c').Replace('>', '\u003e')
$safeModel = $safeModel.Replace([string][char]0x2028, '\u2028').Replace([string][char]0x2029, '\u2029')
$htmlTemplate = @'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'">
<title>Architecture review</title>
<style>
:root{color-scheme:light;--paper:#f5f2e9;--card:#fffdf7;--ink:#243630;--muted:#4a5d54;--line:#b8c0b5;--accent:#285b49;--gold:#73531a;--soft:#e6eee7}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}header,main,footer{max-width:1500px;margin:auto;padding:24px}header{padding-bottom:12px}h1{font:600 clamp(1.8rem,4vw,2.8rem)/1.2 Georgia,serif;margin:8px 0 12px}h2{font-size:1.3rem;margin:0 0 12px}h3{font-size:1.05rem;margin:0 0 8px}p{margin:8px 0;overflow-wrap:anywhere}.eyebrow{font-size:.8rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}.notice{border-left:4px solid var(--gold);background:#eee8d8;padding:12px 16px;max-width:1000px}.baseline{font-size:.85rem;color:var(--muted);overflow-wrap:anywhere}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-top:24px}button{font:inherit;color:inherit;border:1px solid var(--line);border-radius:8px;min-height:44px;padding:9px 16px;background:var(--card);cursor:pointer}button:hover{background:var(--soft)}button:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--gold);outline-offset:3px}.tabs button[aria-selected=true]{background:var(--accent);color:white;border-color:var(--accent)}[hidden]{display:none!important}.layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:18px;min-width:0}.details{position:sticky;top:16px;max-height:calc(100vh - 32px);overflow:auto}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.toolbar .scale{font-size:.85rem;color:var(--muted)}.canvas{overflow:auto;border:1px solid var(--line);border-radius:8px;background:#fffdf7;max-height:70vh;min-height:220px}.canvas svg{display:block;max-width:none}.hint,.empty{color:var(--muted)}.empty{padding:26px 0}.connections{margin:16px 0 0;padding:0;list-style:none;display:grid;gap:8px}.connections li{display:grid;grid-template-columns:26px minmax(0,1fr);gap:8px;padding:8px 0;border-bottom:1px solid #e0e3d9;overflow-wrap:anywhere}.badge{font-size:.78rem;font-weight:700;background:var(--soft);border-radius:50%;width:26px;height:26px;display:inline-grid;place-items:center}.edge-title{font-size:.85rem;font-weight:650}.edge-copy{font-size:.9rem;color:var(--muted)}.node{cursor:pointer}.node rect{fill:#f4f6ee;stroke:#527263;stroke-width:1.6}.node:hover rect,.node:focus rect{fill:#e4eee4;stroke:#73531a;stroke-width:3}.node text{fill:#243630;font-family:system-ui,sans-serif;font-size:15px}.edge{fill:none;stroke:#6c7a70;stroke-width:1.7}.edge-number{font:700 12px system-ui,sans-serif;fill:#243630}.fields{margin:0;display:grid;gap:10px}.fields dt{font-size:.78rem;font-weight:750;text-transform:uppercase;color:var(--muted)}.fields dd{margin:2px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.rows{display:grid;gap:12px}.row{padding:12px;border:1px solid var(--line);border-radius:8px;overflow-wrap:anywhere}.row .status{font-size:.8rem;color:var(--gold);font-weight:700}.tablewrap{overflow:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:12px;overflow-wrap:anywhere}th{font-size:.85rem}footer{font-size:.85rem;color:var(--muted)}.warnings{color:#803520;font-size:.9rem}.check-list{padding-left:20px}.check-list li{margin:8px 0}@media(max-width:950px){.layout{grid-template-columns:1fr}.details{position:static;max-height:none}}@media(max-width:550px){header,main,footer{padding:16px}.card{padding:14px}.tabs button{flex:1}.canvas{max-height:60vh}}
header,main,footer{min-width:0;width:100%;max-width:1500px}section,.layout,.layout>*,.card,.canvas{min-width:0;max-width:100%}.canvas{width:100%}.baseline-evidence{margin:8px 0 16px;max-width:1000px;font-size:.9rem}.baseline-evidence summary{cursor:pointer;color:var(--accent);padding:8px 0;min-height:44px}.baseline-evidence>div{padding:12px 16px;background:var(--card);border:1px solid var(--line);border-radius:8px}.baseline-evidence summary:focus-visible{outline:3px solid var(--gold);outline-offset:3px}@media(max-width:950px){.layout{grid-template-columns:minmax(0,1fr)}}
</style>
</head>
<body>
<header>
<div class="eyebrow">Architecture review · draft</div>
<h1 id="project-title">Project architecture</h1>
<p class="notice">A source-based or proposed design for discussion. This page does not prove that an application works or that a decision is approved. Send changes and decisions to your agent in chat; the agent updates the model and regenerates this review.</p>
<p id="baseline" class="baseline"></p>
<p id="source-status" class="notice">__SOURCE_NOTICE__</p>
<details id="baseline-details" class="baseline-evidence"><summary>Source and review details</summary><div id="baseline-fields"></div></details>
<nav class="tabs" role="tablist" aria-label="Architecture views">
<button id="tab-system" role="tab" aria-selected="true" aria-controls="system" tabindex="0" data-view="system">System</button>
<button id="tab-journeys" role="tab" aria-selected="false" aria-controls="journeys" tabindex="-1" data-view="journeys">Journeys</button>
<button id="tab-data" role="tab" aria-selected="false" aria-controls="data" tabindex="-1" data-view="data">Data</button>
<button id="tab-decisions" role="tab" aria-selected="false" aria-controls="decisions" tabindex="-1" data-view="decisions">Decisions</button>
</nav>
</header>
<main>
<section id="system" role="tabpanel" aria-labelledby="tab-system" tabindex="0">
<div class="layout"><div><div class="card"><h2>How the system connects</h2><p class="hint">Select a box to see its responsibility and related requirements. Numbered arrows match the full connection labels below.</p><div id="system-diagram"></div></div></div><aside id="node-details" class="card details" aria-live="polite"><h2>Explore a component</h2><p>Select a box in a diagram. You can also reach boxes with Tab and press Enter.</p></aside></div>
</section>
<section id="journeys" role="tabpanel" aria-labelledby="tab-journeys" tabindex="0" hidden><h2>What people do</h2><p class="hint">Each journey shows the designed steps and handoffs, including branches when they are present in the model.</p><div id="journey-list"></div></section>
<section id="data" role="tabpanel" aria-labelledby="tab-data" tabindex="0" hidden><div class="card"><h2>Information and relationships</h2><p class="hint">Boxes show records and their fields. Numbered arrows identify relationships defined by the agent.</p><div id="data-diagram"></div></div><div class="card"><h2>Who can access what</h2><p class="hint">These are the model's access claims. They still require authorization checks against the implementation.</p><div id="permissions"></div></div></section>
<section id="decisions" role="tabpanel" aria-labelledby="tab-decisions" tabindex="0" hidden><div class="card"><h2>Questions and recorded decisions</h2><p class="hint">Status labels are supplied by the model; this page cannot grant approval.</p><div id="questions" class="rows"></div></div><div class="card"><h2>Requirements</h2><div id="requirements" class="rows"></div></div><div class="card"><h2>Verification scenarios</h2><p class="hint">A scenario listed here is not evidence that it passed. Read its recorded status and evidence.</p><div id="tests" class="rows"></div></div><div class="card"><h2>Planned work</h2><div id="tasks" class="rows"></div></div></section>
</main>
<footer>Standalone offline review. No external scripts, network calls, model editing or approval actions.</footer>
<script id="architecture-model" type="application/json">__MODEL_JSON__</script>
<script>
'use strict';
const model=JSON.parse(document.getElementById('architecture-model').textContent);
const NS='http://www.w3.org/2000/svg';
const list=value=>Array.isArray(value)?value:[];
const str=value=>value===undefined||value===null?'':String(value);
const display=value=>typeof value==='object'&&value!==null?JSON.stringify(value,null,2):str(value);
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const svgEl=(tag,attrs={})=>{const n=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,str(value));return n;};
const empty=container=>container.append(el('p','Agent has not designed this view yet.','empty'));
document.getElementById('project-title').textContent=(str(model.project)||'Project')+' architecture';
document.title=(str(model.project)||'Project')+' - Architecture review';
const requirements=list(model.requirements);
const fields=(record,omit=[])=>{const dl=el('dl',undefined,'fields');if(!record||typeof record!=='object'){dl.append(el('dd',display(record)));return dl;}for(const [key,value]of Object.entries(record)){if(omit.includes(key))continue;const group=el('div');group.append(el('dt',key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')),el('dd',display(value)));dl.append(group);}return dl;};
const baseline=model.baseline&&typeof model.baseline==='object'?model.baseline:{};
const evidenceStates=list(model.components).map(component=>str(component?.evidenceStatus).toLowerCase());
const observed=evidenceStates.includes('observed')||/source[- ](?:only|based)/i.test(str(baseline.environment)+' '+str(baseline.description));
const proposed=evidenceStates.includes('proposed')||str(baseline.evidenceStatus).toLowerCase()==='proposed';
const baselineSummary=[observed?(proposed?'Source and proposed design · draft':'Source-based draft'):'Draft design'];
if(baseline.inspectedOn)baselineSummary.push('Inspected '+str(baseline.inspectedOn));
if(baseline.commit)baselineSummary.push('Revision '+str(baseline.commit).slice(0,8));
document.getElementById('baseline').textContent=baselineSummary.join(' · ')+'. Live behavior is not verified by this review.';
if(model.baseline)document.getElementById('baseline-fields').append(fields(model.baseline));else document.getElementById('baseline-details').hidden=true;
function relatedRequirements(node){const id=str(node.id);return requirements.filter(r=>r&&typeof r==='object'&&(str(r.owner)===id||str(r.component)===id||list(r.components).map(str).includes(id)||list(r.componentIds).map(str).includes(id)));}
function showDetails(node){const panel=document.getElementById('node-details');panel.replaceChildren(el('h2',str(node.label)||str(node.id)||'Record'),fields(node,['label']));const related=relatedRequirements(node);panel.append(el('h3','Related requirements'));if(!related.length)panel.append(el('p','No related requirements are recorded.','hint'));for(const item of related)panel.append(fields(item));}
const measure=document.createElement('canvas').getContext('2d');if(measure)measure.font='650 15px system-ui, sans-serif';
function wrap(text,limit=245){const out=[],width=value=>measure?measure.measureText(value).width:Array.from(value).length*15;for(const paragraph of str(text).split(/\r?\n/)){let line='';for(const word of paragraph.split(/\s+/)){if(!word)continue;const chars=Array.from(word);let piece='';for(const ch of chars){if(piece&&width(piece+ch)>limit){if(line){out.push(line);line='';}out.push(piece);piece='';}piece+=ch;}if(line&&width(line+' '+piece)>limit){out.push(line);line=piece;}else line+=(line?' ':'')+piece;}out.push(line);}return out.length?out:[''];}
let diagramSerial=0;
const fitting=[];
function diagram(container,rawNodes,rawEdges,caption){
 const nodes=list(rawNodes).filter(n=>n&&typeof n==='object');if(!nodes.length){empty(container);return;}
 const serial=++diagramSerial,boxW=280,gapX=160,gapY=160,pad=140;
 const seen=new Set(),entries=[],warnings=[];
 nodes.forEach((node,index)=>{const id=str(node.id);if(!id||seen.has(id)){warnings.push('A missing or duplicate node ID was omitted: '+(str(node.label)||id||'(unnamed)'));return;}seen.add(id);const lines=wrap(str(node.label)||id);const fieldLines=list(node.fields).flatMap(f=>wrap(display(f)));const h=38+lines.length*21+(fieldLines.length?18+fieldLines.length*19:0);const pos=v=>Number.isInteger(v)&&v>=0&&v<=100;const col=pos(node.column)?node.column:index%4;const row=pos(node.row)?node.row:Math.floor(index/4);entries.push({node,id,lines,fieldLines,h,col,row});});
 if(!entries.length){empty(container);return;}
 const rowHeights=new Map();for(const e of entries)rowHeights.set(e.row,Math.max(rowHeights.get(e.row)||0,e.h));
 const rowY=row=>{let y=pad;for(let r=0;r<row;r++)y+=(rowHeights.get(r)||100)+gapY;return y;};
 const byId=new Map();for(const e of entries){e.x=pad+e.col*(boxW+gapX);e.y=rowY(e.row);byId.set(e.id,e);}
 const width=Math.max(...entries.map(e=>e.x+boxW))+pad,height=Math.max(...entries.map(e=>e.y+e.h))+pad;
 const toolbar=el('div',undefined,'toolbar'),minus=el('button','−'),plus=el('button','+'),fit=el('button','Fit width'),scaleText=el('span','100%','scale');minus.type=plus.type=fit.type='button';minus.setAttribute('aria-label','Zoom out');plus.setAttribute('aria-label','Zoom in');toolbar.append(minus,plus,fit,scaleText);
 const canvas=el('div',undefined,'canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label',caption+'; scroll to explore');
 const svg=svgEl('svg',{viewBox:'0 0 '+width+' '+height,role:'group','aria-label':caption});const defs=svgEl('defs');const marker=svgEl('marker',{id:'arrow-'+serial,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.append(svgEl('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#6c7a70'}));defs.append(marker);svg.append(defs);
 const connections=el('ol',undefined,'connections');let edgeIndex=0;
 for(const edge of list(rawEdges)){if(!edge||typeof edge!=='object')continue;const a=byId.get(str(edge.from)),b=byId.get(str(edge.to));if(!a||!b){warnings.push('Connection not drawn because its endpoint is missing: '+str(edge.from)+' → '+str(edge.to));continue;}edgeIndex++;
  // Orthogonal connectors stay in column gutters and above-row corridors.
  // Even a skipped step or reverse edge must never cross another node box.
  const lane=(edgeIndex-1)%8,laneOffset=28+lane*12;
  const x1=a.x+boxW,y1=a.y+a.h/2,x2=b.x,y2=b.y+b.h/2;
  const sourceGutter=x1+laneOffset,targetGutter=x2-laneOffset,corridorY=a.y-laneOffset;
  const path='M '+x1+' '+y1+' L '+sourceGutter+' '+y1+' L '+sourceGutter+' '+corridorY+' L '+targetGutter+' '+corridorY+' L '+targetGutter+' '+y2+' L '+x2+' '+y2;
  const labelX=(sourceGutter+targetGutter)/2,labelY=corridorY;
  const line=svgEl('path',{d:path,class:'edge','marker-end':'url(#arrow-'+serial+')'});const title=svgEl('title');title.textContent=(str(a.node.label)||a.id)+' → '+(str(b.node.label)||b.id)+': '+str(edge.label);line.append(title);svg.append(line,svgEl('circle',{cx:labelX,cy:labelY,r:12,fill:'#fffdf7',stroke:'#b8c0b5'}));const number=svgEl('text',{x:labelX,y:labelY+4,'text-anchor':'middle',class:'edge-number'});number.textContent=edgeIndex;svg.append(number);
  const item=el('li'),copy=el('div');copy.append(el('div',(str(a.node.label)||a.id)+' → '+(str(b.node.label)||b.id),'edge-title'),el('div',str(edge.label)||'Relationship label not supplied.','edge-copy'));item.append(el('span',str(edgeIndex),'badge'),copy);connections.append(item);
 }
 for(const e of entries){const group=svgEl('g',{class:'node',role:'button',tabindex:0,'aria-label':(str(e.node.label)||e.id)+'. Show details','aria-controls':'node-details'});group.append(svgEl('rect',{x:e.x,y:e.y,width:boxW,height:e.h,rx:10}));const text=svgEl('text',{x:e.x+16,y:e.y+28,'font-weight':650});e.lines.forEach((line,i)=>{const span=svgEl('tspan',{x:e.x+16,dy:i?21:0});span.textContent=line;text.append(span);});group.append(text);if(e.fieldLines.length){const offset=38+e.lines.length*21;group.append(svgEl('line',{x1:e.x+14,x2:e.x+boxW-14,y1:e.y+offset-12,y2:e.y+offset-12,stroke:'#b8c0b5'}));const fieldText=svgEl('text',{x:e.x+16,y:e.y+offset+6});e.fieldLines.forEach((line,i)=>{const span=svgEl('tspan',{x:e.x+16,dy:i?19:0});span.textContent=line;fieldText.append(span);});group.append(fieldText);}const open=()=>{showDetails(e.node);if(document.getElementById('system').hidden){const details=el('div',undefined,'card');details.append(el('h3',(str(e.node.label)||e.id)+' details'),fields(e.node,['label']));const related=relatedRequirements(e.node);if(related.length){details.append(el('h3','Related requirements'));related.forEach(r=>details.append(fields(r)));}const old=container.querySelector('.local-details');if(old)old.remove();details.classList.add('local-details');container.append(details);details.tabIndex=-1;details.focus();}};group.addEventListener('click',open);group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});svg.append(group);}
 canvas.append(svg);container.append(toolbar,canvas);if(edgeIndex)container.append(el('h3','Connections'),connections);else container.append(el('p','No connections are recorded for this diagram.','hint'));if(warnings.length)container.append(el('p',warnings.join(' '),'warnings'));
 let scale=1;const setScale=value=>{scale=Math.max(.85,Math.min(2.5,value));svg.style.width=Math.round(width*scale)+'px';svg.style.height=Math.round(height*scale)+'px';scaleText.textContent=Math.round(scale*100)+'%'+(width*scale>canvas.clientWidth?' · scroll to explore':'');};const fitWidth=()=>{if(canvas.clientWidth>0)setScale(Math.min(1,(canvas.clientWidth-4)/width));};minus.addEventListener('click',()=>setScale(scale/1.25));plus.addEventListener('click',()=>setScale(scale*1.25));fit.addEventListener('click',fitWidth);fit.textContent='Fit readable width';toolbar.after(el('p','Text stays readable. Scroll inside the diagram to see boxes beyond the visible area.','hint'));setScale(1);fitting.push({container,fitWidth});
 if(typeof ResizeObserver!=='undefined'){let previousWidth=-1;const observer=new ResizeObserver(()=>{if(canvas.clientWidth>0&&canvas.clientWidth!==previousWidth){previousWidth=canvas.clientWidth;fitWidth();}});observer.observe(canvas);}
}
diagram(document.getElementById('system-diagram'),model.components,model.edges,'System connections');
const journeys=document.getElementById('journey-list');if(!list(model.journeys).length)empty(journeys);for(const journey of list(model.journeys)){if(!journey||typeof journey!=='object')continue;const card=el('div',undefined,'card');card.append(el('h3',str(journey.label)||str(journey.id)||'Journey'));journeys.append(card);diagram(card,journey.nodes,journey.edges,str(journey.label)||'Journey');card.append(el('h3','Failure paths and recovery'));const failures=list(journey.failurePaths);if(!failures.length){card.append(el('p','Agent has not designed the failure paths for this journey yet.','empty'));}else{const paths=el('ul',undefined,'check-list');for(const failure of failures)paths.append(el('li',display(failure).trim()?display(failure):'Failure path not described yet.'));card.append(paths);}}
diagram(document.getElementById('data-diagram'),model.entities,model.relationships,'Data relationships');
const permissions=document.getElementById('permissions');if(!list(model.permissions).length)empty(permissions);else{const wrap=el('div',undefined,'tablewrap'),table=el('table'),head=el('thead'),row=el('tr');for(const label of ['Role','Scope','Where access is enforced']){const th=el('th',label);th.scope='col';row.append(th);}head.append(row);const body=el('tbody');for(const permission of list(model.permissions)){const enforcement=permission?.enforcedAt;const enforcementText=Array.isArray(enforcement)?enforcement.map(display).filter(value=>value.trim()).join('\n'):display(enforcement);const tr=el('tr');tr.append(el('td',str(permission?.role)||'Unspecified role'),el('td',display(permission?.scope)||'Scope not supplied'),el('td',enforcementText.trim()?enforcementText:'Enforcement boundary not supplied'));body.append(tr);}table.append(head,body);wrap.append(table);permissions.append(wrap);}
for(const key of ['questions','requirements','tests','tasks']){const target=document.getElementById(key),items=list(model[key]);if(!items.length)empty(target);for(const record of items){const card=el('article',undefined,'row');if(record&&typeof record==='object'){card.append(el('h3',[record.id,record.label||record.title||record.question||record.scenario].filter(Boolean).map(str).join(' · ')||'Recorded item'));if(record.status)card.append(el('p','Recorded status: '+str(record.status),'status'));card.append(fields(record,['id','label','title','question','scenario','status']));}else card.append(el('p',display(record)));target.append(card);}}
const tabs=Array.from(document.querySelectorAll('[role=tab]'));
function activate(tab,focus=false){for(const button of tabs){const selected=button===tab;button.setAttribute('aria-selected',str(selected));button.tabIndex=selected?0:-1;document.getElementById(button.dataset.view).hidden=!selected;}if(focus)tab.focus();requestAnimationFrame(()=>{for(const item of fitting)if(item.container.getClientRects().length)item.fitWidth();});}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>activate(tab));tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();activate(tabs[next],true);});});activate(tabs[0]);
if(typeof window!=='undefined')window.addEventListener('resize',()=>{for(const item of fitting)if(item.container.getClientRects().length)item.fitWidth();});
</script>
</body>
</html>
'@
$sourceMessage = switch ($SourceState) {
    'current' { 'Source and diagram were reconciled at this check.' }
    'changed' { 'Source or design changed. The agent must review the differences before this diagram is treated as current.' }
    'unavailable' { 'The source could not be checked. This diagram has no current source confirmation.' }
    default { 'The source has not yet been reconciled with this diagram.' }
}
if ($SourceCheckedAt) { $sourceMessage += ' Checked: ' + $SourceCheckedAt + '.' }
$sourceMessage += ' This is a saved snapshot; ask the agent to check again after code changes.'
$html = $htmlTemplate.Replace('__SOURCE_NOTICE__', [System.Net.WebUtility]::HtmlEncode($sourceMessage)).Replace('__MODEL_JSON__', $safeModel)
$outputDirectory = [System.IO.Path]::GetDirectoryName($outputFile)
if (-not [System.IO.Directory]::Exists($outputDirectory)) {
    [void][System.IO.Directory]::CreateDirectory($outputDirectory)
}
[System.IO.File]::WriteAllText($outputFile, $html, [System.Text.UTF8Encoding]::new($false))
Write-Output $outputFile
