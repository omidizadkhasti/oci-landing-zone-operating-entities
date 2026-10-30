"""Explicit pilot checks: deny unlabelled clients, restart service, read retained output.

Uses only the named namespace and existing synthetic smoke Job template. Does not
read Secret values. --restart explicitly authorizes the pilot deployment restart.
"""
import argparse
import copy
import json
import os
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--kubeconfig', required=True)
parser.add_argument('--namespace', default='oci-landing-zone')
parser.add_argument('--generation-id', required=True)
parser.add_argument('--restart', action='store_true', required=True)
args = parser.parse_args()
base = ['kubectl', '--kubeconfig', args.kubeconfig, '-n', args.namespace]
env = dict(os.environ, SUPPRESS_LABEL_WARNING='True')


def run(*arguments, payload=None):
    return subprocess.run(base + list(arguments), input=payload, env=env,
                          check=True, capture_output=True, text=True).stdout


template = json.loads(run('get', 'job', 'landingzone-mcp-smoke', '-o', 'json'))['spec']['template']
suffix = str(int(time.time()))


def check(name, script, allowed):
    pod = copy.deepcopy(template)
    pod['metadata'] = {'labels': {'app': 'landingzone-mcp-smoke'}}
    if allowed:
        pod['metadata']['labels']['oci-landing-zone-client'] = 'true'
    pod['spec']['containers'][0]['command'] = ['node', '--input-type=module', '-e', script]
    job_name = name + '-' + suffix
    job = {'apiVersion': 'batch/v1', 'kind': 'Job',
           'metadata': {'name': job_name, 'namespace': args.namespace},
           'spec': {'backoffLimit': 0, 'activeDeadlineSeconds': 120,
                    'ttlSecondsAfterFinished': 3600, 'template': pod}}
    run('create', '-f', '-', payload=json.dumps(job))
    run('wait', '--for=condition=complete', 'job/' + job_name, '--timeout=60s')
    return json.loads(run('logs', 'job/' + job_name))


denial = check('landingzone-network-denial', r'''
import https from 'node:https';
import {readFile} from 'node:fs/promises';
const req=https.request(process.env.LZ_MCP_URL, {
  ca:await readFile(process.env.LZ_CLIENT_CA_FILE),
  cert:await readFile(process.env.LZ_CLIENT_CERT_FILE),
  key:await readFile(process.env.LZ_CLIENT_KEY_FILE), signal:AbortSignal.timeout(4000),
}, response=>{response.resume();console.error('Unexpected network access');process.exitCode=1;});
req.on('error',error=>{
  if(error.name==='AbortError') console.log(JSON.stringify({networkPolicyDenied:true}));
  else {console.error('Unexpected connection failure');process.exitCode=1;}
});req.end();
''', False)

run('rollout', 'restart', 'deployment/landingzone-mcp')
run('rollout', 'status', 'deployment/landingzone-mcp', '--timeout=120s')
script = r'''
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connectClient} from '/app/client.mjs';
const connection=await connectClient();
try {
 const response=await connection.client.callTool({name:'landingzone_get_generation',arguments:{projectId:'smoke-test',generationId:GENERATION_ID}});
 const manifest=response.structuredContent.manifest;
 assert.ok(manifest,'Completed generation did not survive restart');
 const artifact=await connection.client.callTool({name:'landingzone_read_artifact',arguments:{projectId:'smoke-test',generationId:GENERATION_ID,name:'bundle.zip'}});
 const data=artifact.structuredContent;
 assert.equal(data.nextOffset,null);
 assert.equal(createHash('sha256').update(Buffer.from(data.data,'base64')).digest('hex'),data.sha256);
 console.log(JSON.stringify({persistedAfterRestart:true,generationId:manifest.generationId,bundleSha256:data.sha256}));
}finally{await connection.close();}
'''.replace('GENERATION_ID', json.dumps(args.generation_id))
persistence = check('landingzone-persistence', script, True)
print(json.dumps({'network': denial, 'persistence': persistence}, indent=2))
