import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { parseDesign } from '../dist/schema.mjs';
import { validateDesign } from '../dist/engine.mjs';

// Pure shared test data; no MCP dependency is introduced into frontend tests.
const fixture=await build({entryPoints:[resolve(import.meta.dirname,'../../src/headless/planningMatrix.testSupport.ts')],bundle:true,write:false,platform:'node',format:'esm',target:'node24'});
const {cases,modelFor}=await import('data:text/javascript;base64,'+Buffer.from(fixture.outputFiles[0].text).toString('base64'));
assert.equal(cases.length,544);
for(const s of cases)test('Planning closed schema combination '+JSON.stringify(s),()=>{
 const design=parseDesign({schemaVersion:'1.0',projectId:'planning-matrix',revision:1,name:'Planning-matrix',configuration:modelFor(s),evidence:[],decisions:[],unresolvedItems:[]});
 assert.deepEqual(validateDesign(design).issues,[]);
});
for(const kind of ['manual-oke','custom','hub','custom-override'])test('nonempty manual subnet contract '+kind,()=>{
 const m=modelFor({hub:'hub_b',scope:'complete',environments:1,workload:kind.startsWith('custom')?'custom':'oke',cni:'native',fss:false,publicLb:false});
 if(kind==='hub')m.network.subnets=[];
 else if(kind==='custom-override')m.platforms[0].overrides[m.environments[0].id].subnets=[];
 else m.platforms[0].subnets=[];
 assert.throws(()=>parseDesign({schemaVersion:'1.0',projectId:'matrix',revision:1,name:'matrix',configuration:m,evidence:[],decisions:[],unresolvedItems:[]}));
});
