import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  fingerprintDataset,
  appendRunRecord,
  readRunLog,
  latestByRun,
  type TuningRunRecord,
} from './run-log';

/**
 * The run logbook. Because a tune costs finite credits and cannot be re-run on a
 * whim, every run is a durable, inspectable artifact: what data went in, which
 * job produced it, what it cost, and how the model scored before and after.
 *
 * Append-only, like the trust ledger — a run's history is a sequence of events,
 * and current state is derived by taking the latest event per run. Nothing here
 * updates or deletes.
 */

let logPath: string;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mandate-runlog-'));
  logPath = path.join(tmpDir, 'runs.jsonl');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function record(over: Partial<TuningRunRecord>): TuningRunRecord {
  return {
    runId: 'run-1',
    createdAt: '2026-07-23T00:00:00.000Z',
    status: 'planned',
    method: 'dpo',
    baseModelId: 'ibm/granite-4-h-small',
    tunedModelId: null,
    datasetPath: 'data/training/preferences.jsonl',
    datasetPairCount: 0,
    datasetFingerprint: 'abc',
    hyperparameters: {},
    watsonxJobId: null,
    costCredits: null,
    durationSeconds: null,
    baseScore: null,
    tunedScore: null,
    notes: '',
    ...over,
  };
}

describe('fingerprintDataset', () => {
  it('is stable for the same data', () => {
    const pairs = [{ prompt: 'p', chosen: { a: 1 }, rejected: { a: 2 } }];
    expect(fingerprintDataset(pairs)).toBe(fingerprintDataset(pairs));
  });

  it('changes when the data changes', () => {
    const a = fingerprintDataset([{ prompt: 'p', chosen: { x: 1 } }]);
    const b = fingerprintDataset([{ prompt: 'p', chosen: { x: 2 } }]);
    expect(a).not.toBe(b);
  });
});

describe('append and read', () => {
  it('reads back a record that was appended', () => {
    appendRunRecord(record({ runId: 'run-1' }), logPath);
    const log = readRunLog(logPath);

    expect(log).toHaveLength(1);
    expect(log[0].runId).toBe('run-1');
    expect(log[0].baseModelId).toBe('ibm/granite-4-h-small');
  });

  it('appends without overwriting earlier records', () => {
    appendRunRecord(record({ runId: 'run-1', status: 'planned' }), logPath);
    appendRunRecord(record({ runId: 'run-1', status: 'completed', tunedModelId: 'tuned-x' }), logPath);

    const log = readRunLog(logPath);
    expect(log).toHaveLength(2); // both events survive; nothing is mutated
  });

  it('returns an empty log when the file does not exist yet', () => {
    expect(readRunLog(path.join(tmpDir, 'missing.jsonl'))).toEqual([]);
  });
});

describe('latestByRun', () => {
  it('collapses a run to its most recent event', () => {
    appendRunRecord(record({ runId: 'run-1', status: 'planned' }), logPath);
    appendRunRecord(record({ runId: 'run-1', status: 'running' }), logPath);
    appendRunRecord(record({ runId: 'run-1', status: 'completed', tunedModelId: 'tuned-x' }), logPath);
    appendRunRecord(record({ runId: 'run-2', status: 'planned' }), logPath);

    const current = latestByRun(readRunLog(logPath));

    expect(current).toHaveLength(2);
    const runOne = current.find((r) => r.runId === 'run-1')!;
    expect(runOne.status).toBe('completed');
    expect(runOne.tunedModelId).toBe('tuned-x');
  });
});
