import { describe, it, expect } from 'vitest';
import { VERSION } from './index.js';

describe('Seahorse', () => {
  it('should export a version string', () => {
    expect(VERSION).toBe('0.1.0');
  });
});