import { describe, expect, it } from 'vitest';
import { smoke } from './index.js';

describe('domain smoke test', () => {
  it('passes smoke test', () => {
    expect(smoke()).toBe(true);
  });
});
