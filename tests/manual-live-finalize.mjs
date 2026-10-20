// Run only after an independent reviewer has inspected the live fixture.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const [rootArg,reviewer,evidence]=process.argv.slice(2);
if(!rootArg||!reviewer||!evidence) throw Error('Usage: node tests/manual-live-finalize.mjs FIXTURE ACTUAL_REVIEWER REVIEW_REFERENCE');
const root=path.resolve(rootArg),cli=fileURLToPath(new URL('../bin/project-init.mjs',import.meta.url));
function run(...args){
 const r=spawnSync(process.execPath,[cli,...args,'--project',root,'--json'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
 // verify streams genuine TAP output ahead of its JSON receipt.
 fs.writeFileSync(path.join(root,'.project-init',`acceptance-${args[0]}.log`),r.stdout+r.stderr);
 return args[0]==='verify'?null:JSON.parse(r.stdout);
}
run('source-review','--actor',reviewer,'--evidence',evidence);
run('verify','--execute');
const findings={schemaVersion:1,findings:[{id:'REQ-ADD',verdict:'pass',evidenceFiles:['src/add.mjs','tests/add.test.mjs','specs/add.md'],note:'Independent review confirms direct numeric addition and unchanged tests/spec; actual configured tests are separately enforced.'}]};
fs.writeFileSync(path.join(root,'.project-init','review-input.json'),JSON.stringify(findings,null,2));
run('semantic','import','--file','.project-init/review-input.json','--actor',reviewer,'--evidence',evidence);
const guard=run('guard');
assert.equal(guard.passed,true);assert.equal(guard.releaseApproved,false);
assert.equal(run('status').releaseCandidateReady,true);
const source=path.join(root,'src','add.mjs'),original=fs.readFileSync(source,'utf8');
let stale;
try {
 fs.writeFileSync(source,'export function add(a,b) { return a-b; }\n');
 assert.equal(run('status').releaseCandidateReady,false);
 const r=spawnSync(process.execPath,[cli,'guard','--project',root,'--json'],{encoding:'utf8'});
 assert.equal(r.status,1);stale=JSON.parse(r.stdout);
 assert.equal(stale.passed,false);assert.equal(stale.executionValid,false);assert.equal(stale.testsCurrent,false);assert.equal(stale.semanticCurrent,false);
} finally {fs.writeFileSync(source,original);}
const restored=run('guard');assert.equal(restored.passed,true);
const summary={guard,stale,restored,reviewer,evidence};
fs.writeFileSync(path.join(root,'.project-init','acceptance-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
