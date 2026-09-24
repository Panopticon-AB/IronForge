import { describe, expect, it } from 'vitest';
import { LiveStrengthSessionManager } from './active-strength-session';
import { CANONICAL_STRENGTH_TEMPLATES } from '@/features/training/canonicalTemplates';
import type { CanonicalStrengthSetInput } from '@/features/strength-evidence/write-contract';

describe('LiveStrengthSessionManager', () => {
  it('starts an A1 session with ordered exercises and preserves snapshot', () => {
    const manager = new LiveStrengthSessionManager();
    const session = manager.startSession({
      sessionId: 'sess-100',
      userId: 'user-1',
      template: CANONICAL_STRENGTH_TEMPLATES.A1,
      startedAt: '2026-09-24T18:00:00.000Z',
    });

    expect(session.status).toBe('ACTIVE');
    expect(session.performedExercises).toHaveLength(5);
    expect(session.performedExercises[0].exerciseName).toBe('Belt Squat');
    expect(session.performedExercises[0].measurementMode).toBe('LOAD_AND_REPS');
    expect(session.performedExercises[4].exerciseName).toBe('Ab Wheel');
    expect(session.performedExercises[4].measurementMode).toBe('REPS_ONLY');
  });

  it('records sets independently and idempotently (prevents double tap duplicates)', () => {
    const manager = new LiveStrengthSessionManager();
    let session = manager.startSession({
      sessionId: 'sess-100',
      userId: 'user-1',
      template: CANONICAL_STRENGTH_TEMPLATES.A1,
    });

    const set1: CanonicalStrengthSetInput = {
      id: 'set-id-1',
      performedExerciseId: 'perf-bs-1',
      clientWriteId: 'cw-bs-1',
      measurementMode: 'LOAD_AND_REPS',
      load: 90,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 8,
      completedAt: '2026-09-24T18:05:00.000Z',
      setType: 'NORMAL',
    };

    // First tap
    session = manager.logSet(session, 0, set1);
    expect(session.performedExercises[0].sets).toHaveLength(1);
    expect(session.performedExercises[0].sets[0].load).toBe(90);

    // Double tap retry with same clientWriteId
    session = manager.logSet(session, 0, set1);
    expect(session.performedExercises[0].sets).toHaveLength(1); // Still 1, no duplicate
  });

  it('allows finishing a partial session with Klar för idag without requiring all exercises', () => {
    const manager = new LiveStrengthSessionManager();
    let session = manager.startSession({
      sessionId: 'sess-100',
      userId: 'user-1',
      template: CANONICAL_STRENGTH_TEMPLATES.A1,
    });

    // Only log Belt Squat, skip the other 4 exercises
    session = manager.logSet(session, 0, {
      id: 'set-id-1',
      performedExerciseId: 'perf-bs-1',
      clientWriteId: 'cw-bs-1',
      measurementMode: 'LOAD_AND_REPS',
      load: 90,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 8,
      completedAt: '2026-09-24T18:05:00.000Z',
      setType: 'NORMAL',
    });

    // Finish via "Klar för idag"
    session = manager.finishSession(session, {
      explicitKlarForIdag: true,
      finishedAt: '2026-09-24T18:20:00.000Z',
    });

    expect(session.status).toBe('COMPLETED');
    expect(session.outcome).toBe('KLAR_FOR_IDAG');
    expect(session.completedAt).toBe('2026-09-24T18:20:00.000Z');
    // Work done is preserved
    expect(session.performedExercises[0].sets).toHaveLength(1);
  });

  it('allows post-hoc correction of a logged set', () => {
    const manager = new LiveStrengthSessionManager();
    let session = manager.startSession({
      sessionId: 'sess-100',
      userId: 'user-1',
      template: CANONICAL_STRENGTH_TEMPLATES.A1,
    });

    session = manager.logSet(session, 0, {
      id: 'set-id-1',
      performedExerciseId: 'perf-bs-1',
      clientWriteId: 'cw-bs-1',
      measurementMode: 'LOAD_AND_REPS',
      load: 90,
      loadUnit: 'KG',
      loadSemantics: 'TOTAL_EXTERNAL_LOAD',
      reps: 8,
      completedAt: '2026-09-24T18:05:00.000Z',
      setType: 'NORMAL',
    });

    // User realized they did 100 kg instead of 90 kg
    session = manager.correctSet(session, 'cw-bs-1', { load: 100 });
    expect(session.performedExercises[0].sets[0].load).toBe(100);

    // Negative loads or invalid schemas must be rejected
    expect(() => {
      manager.correctSet(session, 'cw-bs-1', { load: -50 });
    }).toThrow(/Invalid set correction/);
  });
});
