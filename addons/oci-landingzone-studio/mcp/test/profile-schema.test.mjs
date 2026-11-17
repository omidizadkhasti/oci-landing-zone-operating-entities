import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLzModel, runEngine } from '../dist/engine.mjs';
import { parseDesign } from '../dist/schema.mjs';

function design(size, cniType) {
 const configuration=emptyLzModel();
 configuration.foundation.notifications.default='planning-test@example.com';
 configuration.environments=configuration.environments.slice(0,1);
 configuration.environments[0].securityZone=false;
 configuration.platforms=[{id:'oke',key:'oke',type:'oke_simple',environments:'all',vcnCidr:'10.64.0.0/'+{small:20,medium:18,large:16}[size],subnets:[],okeParams:{
  clusterSize:size,kubernetesVersion:'v1.35.2',servicesCidr:'172.20.0.0/16',apiAllowedCidrs:['10.0.3.0/24'],workerImage:String.raw`9\.[0-9]+`,workerBootVolumeSize:60,cniType,createFss:false,publicLoadBalancer:false,
  ...(cniType==='overlay'?{podsCidr:'172.21.0.0/16'}:{}),
 }}];
 return {schemaVersion:'1.0',projectId:'profile-test',revision:1,name:'profile-test',configuration,evidence:[],decisions:[],unresolvedItems:[]};
}
for(const size of ['small','medium','large'])for(const cni of ['native','overlay']){
 test(`closed MCP to real generator: ${size}/${cni}`,async()=>{
  const input=parseDesign(design(size,cni));
  const output=await runEngine('generate',input);
  assert.equal(output.validation.valid,true);
  assert.match(output.files['architecture.drawio'],/<mxfile/);
  assert.match(output.files['network.json'],/10\.64\.0\.0/);
 });
}
test('empty manual or custom subnet arrays remain rejected',()=>{
 const manual=design('small','native');delete manual.configuration.platforms[0].okeParams.clusterSize;
 assert.throws(()=>parseDesign(manual));
 const custom=design('small','native');custom.configuration.platforms[0].type='custom';
 assert.throws(()=>parseDesign(custom));
});
