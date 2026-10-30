import { parentPort, workerData } from 'node:worker_threads';
import { runEngine } from './engine';
try {
  parentPort!.postMessage({ ok: true, result: await runEngine(workerData.action, workerData.design) });
} catch {
  // Jsonnet error stacks can contain input values; do not return or log them.
  parentPort!.postMessage({ ok: false, error: 'Generation failed. Check the design against the supported generator contract.' });
}
