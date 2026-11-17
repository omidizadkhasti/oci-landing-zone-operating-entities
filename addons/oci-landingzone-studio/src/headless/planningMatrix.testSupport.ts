import { emptyLzModel } from '../model/defaults';
import { hubKindDefaults } from '../services/hubKinds';
import { newPlatform, okeProfileSubnets } from '../services/platforms';
import type { HubKind, LzModel, OkePlatformParams } from '../model/types';

export type Scenario = { hub: HubKind; scope: 'complete' | 'regional'; environments: number; workload: string; size?: OkePlatformParams['clusterSize']; cni?: 'native' | 'overlay'; fss?: boolean; publicLb?: boolean };
const workloads: Omit<Scenario, 'hub' | 'scope' | 'environments'>[] = [{workload:'foundation'}, {workload:'custom'}];
for (const size of [undefined, 'small', 'medium', 'large'] as const)
  for (const cni of ['native', 'overlay'] as const)
    for (const fss of [false, true]) for (const publicLb of [false, true])
      workloads.push({workload:'oke', size, cni, fss, publicLb});
export const cases: Scenario[] = [];
for (const hub of ['hub_a', 'hub_b', 'hub_c', 'hub_e'] as const)
  for (const scope of ['complete', 'regional'] as const)
    for (const environments of [1, 3]) for (const workload of workloads)
      cases.push({hub, scope, environments, ...workload});

export function modelFor(s: Scenario): LzModel {
 const m=emptyLzModel();m.network={hubKind:s.hub,...hubKindDefaults(s.hub)};
 m.foundation.notifications!.default='planning-test@example.com';
 m.foundation.stackScope=s.scope;
 if(s.scope==='regional')Object.assign(m.foundation,{region:'eu-amsterdam-1',regionShortName:'ams',homeRegion:'eu-frankfurt-1'});
 m.environments=Array.from({length:s.environments},(_,i)=>({id:'environment-'+(i+1),name:['prod','test','dev'][i],securityZone:false,network:{vcnCidr:`10.10.${i*8}.0/21`,subnets:['web','app','db','infra'].map((name,j)=>({name,cidr:`10.10.${i*8+j}.0/24`}))}}));
 if(s.workload==='foundation')return m;
 const p=newPlatform(s.workload==='custom'?'custom':'oke_simple',[],m.environments);
 const prefix=s.size==='large'?16:s.size==='medium'?18:s.size==='small'?20:19;
 const vcn=(i:number)=>`10.${64+i}.0.0/${prefix}`;
 p.vcnCidr=vcn(0);p.environments='all';p.overrides={};
 if(s.workload==='custom'){
  p.subnets=[{name:'core',cidr:'10.64.0.0/24'}];
  m.environments.forEach((e,i)=>{p.overrides![e.id]={vcnCidr:vcn(i),subnets:[{name:'core',cidr:`10.${64+i}.0.0/24`}]};});
 }else{
  p.okeParams={...p.okeParams!,clusterSize:s.size,cniType:s.cni!,createFss:s.fss!,publicLoadBalancer:s.publicLb!,servicesCidr:'172.20.0.0/16',...(s.cni==='overlay'?{podsCidr:'172.21.0.0/16'}:{})};
  p.subnets=s.size?[]:okeProfileSubnets(vcn(0).replace('/19','/18'),'medium',s.cni!,s.fss!);
  // The manual map uses the generator's medium layout inside an explicit /19.
  if(!s.size)p.subnets=okeProfileSubnets('10.64.0.0/20','small',s.cni!,s.fss!);
  m.environments.forEach((e,i)=>{p.overrides![e.id]={vcnCidr:vcn(i),...(s.size?{}:{subnets:okeProfileSubnets(`10.${64+i}.0.0/20`,'small',s.cni!,s.fss!)})};});
 }
 m.platforms=[p];return m;
}

