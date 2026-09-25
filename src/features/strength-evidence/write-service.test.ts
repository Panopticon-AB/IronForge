import { describe, expect, it } from 'vitest';
import {
  IdempotentSetWriter,
  toCanonicalStrengthSessionEvidence,
  type StrengthSessionWritePayload,
} from './write-service';
import type { CanonicalStrengthSetInput } from './write-contract';

describe('write-service', () => {
  describe('IdempotentSetWriter', () => {
    it('persists a new set and returns PERSISTED status', () => {
      const writer = new IdempotentSetWriter();
      const setInput: CanonicalStrengthSetInput = {
        id: 'set-1',
        performedExerciseId: 'perf-1',
        clientWriteId: 'write-unique-1',
        measurementMode: 'LOAD_AND_REPS',
        load: 100,
        loadUnit: 'KG',
        loadSemantics: 'TOTAL_EXTERNAL_LOAD',
        reps: 5,
        completedAt: '2026-09-24T18:30:00.000Z',
        setType: 'NORMAL',
      };

      const result = writer.recordSet(setInput);
      expect(result.status).toBe('PERSISTED');
      if (result.status !== 'PERSISTED') return;
      expect(result.clientWriteId).toBe('write-unique-1');
      expect(result.set.load).toBe(100);
      expect(writer.has('write-unique-1')).toBe(true);
    });

    it('ignores duplicate submissions with the same clientWriteId (double tap / retry)', () => {
      const writer = new IdempotentSetWriter();
      const setInput: CanonicalStrengthSetInput = {
        id: 'set-1',
        performedExerciseId: 'perf-1',
        clientWriteId: 'write-unique-1',
        measurementMode: 'LOAD_AND_REPS',
        load: 100,
        loadUnit: 'KG',
        loadSemantics: 'TOTAL_EXTERNAL_LOAD',
        reps: 5,
        completedAt: '2026-09-24T18:30:00.000Z',
        setType: 'NORMAL',
      };

      const first = writer.recordSet(setInput);
      expect(first.status).toBe('PERSISTED');

      // Second identical tap
      const second = writer.recordSet(setInput);
      expect(second.status).toBe('DUPLICATE_IGNORED');
      expect(second.clientWriteId).toBe('write-unique-1');
    });

    it('rejects invalid inputs without persisting them', () => {
      const writer = new IdempotentSetWriter();
      const invalidInput: CanonicalStrengthSetInput = {
        id: 'set-err',
        performedExerciseId: 'perf-1',
        clientWriteId: 'write-invalid',
        measurementMode: 'LOAD_AND_REPS',
        // missing load and reps
        completedAt: '2026-09-24T18:30:00.000Z',
        setType: 'NORMAL',
      };

      const result = writer.recordSet(invalidInput);
      expect(result.status).toBe('INVALID_INPUT');
      expect(writer.has('write-invalid')).toBe(false);
    });
  });

  describe('toCanonicalStrengthSessionEvidence', () => {
    it('maps Live Forge session with multiple measurement modes to canonical strength evidence', () => {
      const payload: StrengthSessionWritePayload = {
        sessionId: 'session-a1-123',
        source: 'IRONFORGE_LIVE_FORGE',
        startedAt: '2026-09-24T18:00:00.000Z',
        endedAt: '2026-09-24T18:45:00.000Z',
        title: 'A1 Belt Squat + Upper',
        performedExercises: [
          {
            performedExerciseId: 'perf-belt-squat',
            exerciseName: 'Belt Squat',
            sequence: 0,
            sets: [
              {
                id: 'set-bs-1',
                performedExerciseId: 'perf-belt-squat',
                clientWriteId: 'cw-1',
                measurementMode: 'LOAD_AND_REPS',
                load: 80,
                loadUnit: 'KG',
                loadSemantics: 'TOTAL_EXTERNAL_LOAD',
                reps: 8,
                rpe: 8,
                completedAt: '2026-09-24T18:10:00.000Z',
                setType: 'NORMAL',
              },
            ],
          },
          {
            performedExerciseId: 'perf-ab-wheel',
            exerciseName: 'Ab Wheel',
            sequence: 1,
            sets: [
              {
                id: 'set-aw-1',
                performedExerciseId: 'perf-ab-wheel',
                clientWriteId: 'cw-2',
                measurementMode: 'REPS_ONLY',
                reps: 10,
                completedAt: '2026-09-24T18:25:00.000Z',
                setType: 'NORMAL',
              },
            ],
          },
        ],
      };

      const evidence = toCanonicalStrengthSessionEvidence(payload);

      expect(evidence.provenance.source).toBe('IRONFORGE_LIVE_FORGE');
      expect(evidence.provenance.providerSessionId).toBe('session-a1-123');
      expect(evidence.exercises).toHaveLength(2);

      // Belt squat set has loadKg, reps, rpe, load, loadUnit, loadSemantics, clientWriteId
      expect(evidence.exercises[0].sets[0]).toMatchObject({
        loadKg: 80,
        load: 80,
        loadUnit: 'KG',
        loadSemantics: 'TOTAL_EXTERNAL_LOAD',
        clientWriteId: 'cw-1',
        measurementMode: 'LOAD_AND_REPS',
        reps: 8,
        rpe: 8,
      });

      // Ab wheel set has reps only; no manufactured rpe, loadKg is absent
      const abWheelSet = evidence.exercises[1].sets[0];
      expect(abWheelSet.reps).toBe(10);
      expect(abWheelSet.clientWriteId).toBe('cw-2');
      expect(abWheelSet.measurementMode).toBe('REPS_ONLY');
      expect('loadKg' in abWheelSet).toBe(false);
      expect('load' in abWheelSet).toBe(false);
      expect('rpe' in abWheelSet).toBe(false);
    });
  });
});
