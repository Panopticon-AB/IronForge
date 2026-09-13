import { OracleService } from '@/services/oracle';
import type { TTBIndices } from '@/types';
import { describe, expect, it } from 'vitest';

const ttb: TTBIndices = {
  strength: 50,
  endurance: 50,
  wellness: 50,
  lowest: 'wellness',
};

describe('OracleService.consult recovery evidence', () => {
  it('does not force recovery when Body Battery is unknown', async () => {
    const result = await OracleService.consult({}, ttb);

    expect(result.type).toBe('GRIND');
    expect(result.rationale).not.toContain('fatigue');
  });

  it('uses a measured low Body Battery as recovery evidence', async () => {
    const result = await OracleService.consult({ bodyBattery: 20 }, ttb);

    expect(result.type).toBe('RECOVERY');
    expect(result.rationale).toContain('Low Body Battery (20)');
  });

  it('honors LOW_RECOVERY analysis while Body Battery is unknown', async () => {
    const result = await OracleService.consult(
      {},
      ttb,
      [],
      undefined,
      undefined,
      { state: 'LOW_RECOVERY', reason: 'Recent local training load remains high' },
    );

    expect(result.type).toBe('RECOVERY');
    expect(result.rationale).toContain('Recent local training load remains high');
    expect(result.rationale).not.toContain('System fatigue detected');
  });
});
