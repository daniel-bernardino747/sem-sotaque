// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { modo } from './modo';

describe('modo', () => {
  it('is hospedado by default', () => {
    expect(modo({})).toBe('hospedado');
    expect(modo({ MODO: '' })).toBe('hospedado');
  });

  it('reads MODO', () => {
    expect(modo({ MODO: 'local' })).toBe('local');
    expect(modo({ MODO: 'hospedado' })).toBe('hospedado');
  });

  it('refuses a value it does not know, so a typo does not pick a mode silently', () => {
    expect(() => modo({ MODO: 'lcoal' })).toThrow(/MODO/);
  });
});
