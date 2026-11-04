import { describe, it, expect } from 'vitest';
import { isWonStage, isLostStage, isClosedStage, outcomeEvent, importStage } from './stages';

describe('stage types', () => {
  it('recognises a won stage by its type', () => {
    expect(isWonStage({ stage_type: 'won' })).toBe(true);
  });

  it('ignores the name: an open stage called "Won" is open', () => {
    const s = { stage_type: 'open', name: 'Won' } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(isWonStage(s)).toBe(false);
    expect(isClosedStage(s)).toBe(false);
  });

  it('treats a lost stage as closed and not won', () => {
    expect(isLostStage({ stage_type: 'lost' })).toBe(true);
    expect(isClosedStage({ stage_type: 'lost' })).toBe(true);
    expect(isWonStage({ stage_type: 'lost' })).toBe(false);
  });

  it('handles missing stages', () => {
    expect(isWonStage(null)).toBe(false);
    expect(isClosedStage(undefined)).toBe(false);
  });
});

describe('outcomeEvent', () => {
  const open = { stage_type: 'open' }, won = { stage_type: 'won' }, lost = { stage_type: 'lost' };
  it('fires deal.won only when entering a won stage', () => {
    expect(outcomeEvent(open, won)).toBe('deal.won');
    expect(outcomeEvent(won, won)).toBeNull();
    expect(outcomeEvent(null, won)).toBe('deal.won');
  });
  it('fires deal.lost when entering a lost stage', () => {
    expect(outcomeEvent(open, lost)).toBe('deal.lost');
    expect(outcomeEvent(won, lost)).toBe('deal.lost');
    expect(outcomeEvent(lost, lost)).toBeNull();
  });
  it('fires nothing for open targets', () => {
    expect(outcomeEvent(won, open)).toBeNull();
  });
});

describe('importStage', () => {
  const stages = [
    { id: 'a', name: 'Prospect', position: 1, stage_type: 'open' as const },
    { id: 'w2', name: 'Getekend', position: 6, stage_type: 'won' as const },
    { id: 'w1', name: 'Deal rond', position: 5, stage_type: 'won' as const },
    { id: 'l', name: 'Afgehaakt', position: 7, stage_type: 'lost' as const },
    { id: 'o', name: 'Won', position: 2, stage_type: 'open' as const },
  ];
  it('maps a won/lost status to the first won/lost-typed stage by position', () => {
    expect(importStage(stages, { status: 'won', stageName: '' })?.id).toBe('w1');
    expect(importStage(stages, { status: 'Verloren', stageName: 'prospect' })?.id).toBe('l');
  });
  it('matches the stage name when the status is open', () => {
    expect(importStage(stages, { status: 'open', stageName: 'won' })?.id).toBe('o');
  });
  it('falls back to the first open stage by position', () => {
    expect(importStage(stages, { status: '', stageName: 'onbekend' })?.id).toBe('a');
  });
});
