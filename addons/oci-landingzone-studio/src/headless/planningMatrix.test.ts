import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { setAssetLoader } from '../generator/jsonnetVm';
import { generateHeadless } from './generate';
import { validatePlatformContracts } from '../services/platformValidation';
import { validateOkeModel } from '../services/okeValidation';
import { validateRegionalDeployment } from '../services/regionalDeployment';
import { cases, modelFor } from './planningMatrix.testSupport';

beforeAll(() => setAssetLoader(async () => ({ wasmBinary: readFileSync('3rd/go-jsonnet/libjsonnet.wasm') })));
it.skipIf(process.env.ELZ_FULL_MATRIX !== '1').each(cases.map(s=>[JSON.stringify(s),s] as const))('Planning ELZ combination %s',async(_name,s)=>{
 const m=modelFor(s);
 expect([...validatePlatformContracts(m),...validateOkeModel(m),...validateRegionalDeployment(m)]).toEqual([]);
 const out=await generateHeadless(m,'Planning matrix');
 expect(out['architecture.drawio']).toContain('<mxfile');
 expect(out['network.json']).toBeDefined();expect(out['config.jsonnet']).toBeDefined();
 for(const [name,body] of Object.entries(out))if(name.endsWith('.json'))expect(()=>JSON.parse(body)).not.toThrow();
 const cells=out['architecture.drawio'].match(/<mxCell[^>]+/g)??[];
 for(const c of cells.filter(c=>c.includes('&lt;table')))expect(c).toContain('overflow=fill;');
 const json=Object.entries(out).filter(([n])=>n.endsWith('.json')).map(([,v])=>v).join('');
 for(let i=0;i<s.environments;i++)if(s.workload!=='foundation')expect(json).toContain(`10.${64+i}.0.0/`);
},20000);

