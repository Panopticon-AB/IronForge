import { describe, expect, it } from 'vitest';
import {
  CANONICAL_STRENGTH_TEMPLATES,
  snapshotTemplateForSession,
} from './canonicalTemplates';

describe('canonicalTemplates', () => {
  it('defines A1, B1, A2, B2 with stable identity and ordered exercises', () => {
    const templateCodes = Object.keys(CANONICAL_STRENGTH_TEMPLATES) as ('A1' | 'B1' | 'A2' | 'B2')[];
    expect(templateCodes).toEqual(['A1', 'B1', 'A2', 'B2']);

    for (const code of templateCodes) {
      const t = CANONICAL_STRENGTH_TEMPLATES[code];
      expect(t.code).toBe(code);
      expect(t.exercises.length).toBeGreaterThan(0);
      // sequences must be sequential
      t.exercises.forEach((ex, idx) => {
        expect(ex.sequence).toBe(idx);
      });
    }
  });

  it('provides explicit A1 minimum variant: Belt Squat 2 + Bench 2 + Row 2', () => {
    const a1 = CANONICAL_STRENGTH_TEMPLATES.A1;
    const a1Min = snapshotTemplateForSession(a1, true);

    expect(a1Min.exercises.map((e) => e.exerciseId)).toEqual([
      'belt-squat',
      'bench-press',
      'barbell-row',
    ]);
    expect(a1Min.exercises.every((e) => e.prescribedSetsCount === 2)).toBe(true);
  });

  it('provides explicit B1 minimum variant: Leg Ext 2 + Ham Curl 2 + Seated Row 2 + Face Pull 2', () => {
    const b1 = CANONICAL_STRENGTH_TEMPLATES.B1;
    const b1Min = snapshotTemplateForSession(b1, true);

    expect(b1Min.exercises.map((e) => e.exerciseId)).toEqual([
      'leg-extension',
      'hamstring-curl',
      'seated-row',
      'face-pull',
    ]);
    expect(b1Min.exercises.every((e) => e.prescribedSetsCount === 2)).toBe(true);
  });

  it('supports unilateral movements with side-awareness (e.g. Bulgarian Split Squat in B2)', () => {
    const b2 = CANONICAL_STRENGTH_TEMPLATES.B2;
    const bulgarian = b2.exercises.find((e) => e.exerciseId === 'bulgarian-split-squat');
    expect(bulgarian?.unilateral).toBe(true);

    const oneArmRow = b2.exercises.find((e) => e.exerciseId === 'one-arm-db-row');
    expect(oneArmRow?.unilateral).toBe(true);
  });

  it('snapshots template state so future template changes do not mutate the session', () => {
    const original = CANONICAL_STRENGTH_TEMPLATES.A1;
    const snapshot = snapshotTemplateForSession(original);

    // Modify snapshot
    snapshot.name = 'Mutated A1';
    snapshot.exercises[0].prescribedSetsCount = 99;

    // Original must remain untouched
    expect(original.name).toBe('A1 — Belt Squat + Base Upper Body');
    expect(original.exercises[0].prescribedSetsCount).toBe(3);
  });
});
