import { mapHabitifyAdherence } from '@/features/habitify/adherence';
import { describe, expect, it } from 'vitest';

describe('mapHabitifyAdherence', () => {
  it('counts a minimum clear as completed adherence', () => {
    expect(
      mapHabitifyAdherence({ outcome: 'COMPLETED', clearLevel: 'MINIMUM' })
    ).toEqual({
      status: 'COMPLETED',
      reasonCode: 'MINIMUM_CLEAR_COMPLETED',
    });
  });

  it.each(['STANDARD', 'BOSS'] as const)(
    'counts %s clear as completed without extra intensity weighting',
    clearLevel => {
      expect(mapHabitifyAdherence({ outcome: 'COMPLETED', clearLevel })).toEqual({
        status: 'COMPLETED',
        reasonCode: 'SUSTAINABLE_MISSION_COMPLETED',
      });
    }
  );

  it('keeps a downgraded quality day successful when the smaller mission is completed', () => {
    expect(
      mapHabitifyAdherence({
        outcome: 'COMPLETED',
        clearLevel: 'MINIMUM',
        downgradedFromQuality: true,
      })
    ).toEqual({
      status: 'COMPLETED',
      reasonCode: 'MINIMUM_CLEAR_COMPLETED',
    });
  });

  it('counts quit-smart as successful adherence', () => {
    expect(mapHabitifyAdherence({ outcome: 'QUIT_SMART' })).toEqual({
      status: 'COMPLETED',
      reasonCode: 'QUIT_SMART_SUCCESS',
    });
  });

  it('keeps recovery adherence neutral instead of failed', () => {
    expect(mapHabitifyAdherence({ outcome: 'RECOVERY_RESPECTED' })).toEqual({
      status: 'SKIPPED',
      reasonCode: 'RECOVERY_RESPECTED',
    });
  });

  it('keeps a true rest or safety day neutral instead of failed', () => {
    expect(mapHabitifyAdherence({ outcome: 'TRUE_REST' })).toEqual({
      status: 'SKIPPED',
      reasonCode: 'TRUE_REST_DAY',
    });
  });

  it('creates no make-up debt for a family or life constraint', () => {
    expect(mapHabitifyAdherence({ outcome: 'LIFE_CONSTRAINT' })).toEqual({
      status: 'SKIPPED',
      reasonCode: 'LIFE_CONSTRAINT_NO_DEBT',
    });
  });

  it('does nothing when there is no resolved mission outcome', () => {
    expect(mapHabitifyAdherence({ outcome: 'NONE' })).toEqual({
      status: 'NONE',
      reasonCode: 'NO_ACTION',
    });
  });
});
