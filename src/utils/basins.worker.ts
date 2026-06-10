/**
 * Web Worker shell around computeBasinMap — the per-cell GD simulation is
 * O(res² · steps · n) and must not block the UI thread.
 */

import { problemConfigs } from './problems';
import { computeBasinMap } from './basinMap';
import type { DataPoint } from '../types/types';

export interface BasinRequest {
  requestId: number;
  problemType: string;
  data: DataPoint[];
  range: { min: number; max: number };
  learningRate: number;
  res: number;
  oneParam: boolean;
}

self.onmessage = (e: MessageEvent<BasinRequest>) => {
  const { requestId, problemType, data, range, learningRate, res, oneParam } = e.data;
  const config = problemConfigs[problemType];
  if (!config) {
    self.postMessage({ type: 'error', requestId, message: `unknown problem ${problemType}` });
    return;
  }

  const result = computeBasinMap(config, data, range, learningRate, res, oneParam, frac => {
    self.postMessage({ type: 'progress', requestId, frac });
  });

  // Int16Array transfers by buffer — no copy.
  self.postMessage({ type: 'done', requestId, result }, { transfer: [result.cells.buffer] });
};
