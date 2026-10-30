import { Worker } from 'node:worker_threads';
import type { Design } from './schema';
import type { Validation } from './engine';

export interface EngineResult { validation: Validation; files?: Record<string, string> }
export class EngineRunner {
  private active = 0;
  constructor(private readonly timeoutMs = 60_000, private readonly maxConcurrent = 1) {}
  async run(action: 'validate' | 'generate', design: Design, signal?: AbortSignal): Promise<EngineResult> {
    if (signal?.aborted) throw new Error('Request cancelled.');
    if (this.active >= this.maxConcurrent) throw new Error('Generator busy. Retry later.');
    this.active++;
    try {
      return await new Promise<EngineResult>((resolve, reject) => {
        const worker = new Worker(new URL('./worker.mjs', import.meta.url), {
          workerData: { action, design }, resourceLimits: { maxOldGenerationSizeMb: 512, stackSizeMb: 8 },
        });
        let settled = false;
        const finish = (error?: Error, result?: EngineResult) => {
          if (settled) return;
          settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
          // Wait for termination before admitting another expensive generation.
          void worker.terminate().finally(() => error ? reject(error) : resolve(result!));
        };
        const abort = () => finish(new Error('Request cancelled.'));
        const timer = setTimeout(() => finish(new Error('Generation timed out.')), this.timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        worker.once('error', () => finish(new Error('Generator worker failed.')));
        worker.once('exit', () => finish(new Error('Generator worker exited without a result.')));
        worker.once('message', (message) => message.ok ? finish(undefined, message.result) : finish(new Error(message.error)));
      });
    } finally { this.active--; }
  }
}
