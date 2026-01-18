import { describe, expect, it } from 'vitest';
import { validateCommand, validateJobId } from './orchestratorClient';

describe('orchestratorClient validators', () => {
  it('validateCommand trims and rejects empty', () => {
    expect(validateCommand('  echo hi  ')).toBe('echo hi');
    expect(() => validateCommand('')).toThrowError();
    expect(() => validateCommand('   ')).toThrowError();
    expect(() => validateCommand(null)).toThrowError();
  });

  it('validateJobId trims and rejects empty', () => {
    expect(validateJobId('  abc  ')).toBe('abc');
    expect(() => validateJobId('')).toThrowError();
    expect(() => validateJobId(undefined)).toThrowError();
  });
});

