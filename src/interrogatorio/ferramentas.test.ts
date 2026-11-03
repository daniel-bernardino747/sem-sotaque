// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { FERRAMENTAS } from './ferramentas';

/** Keys strict tool use rejects; zod checks them after the model answers. */
const PROIBIDAS = ['$schema', 'pattern', 'minLength', 'minimum', 'maximum'];

function chaves(no: unknown): string[] {
  if (Array.isArray(no)) return no.flatMap(chaves);
  if (no && typeof no === 'object') return Object.entries(no).flatMap(([k, v]) => [k, ...chaves(v)]);
  return [];
}

describe('FERRAMENTAS', () => {
  it.each(FERRAMENTAS.map((f) => [f.name, f]))('%s só usa o JSON Schema que o modo strict aceita', (_, f) => {
    const usadas = chaves(f.input_schema).filter((k) => PROIBIDAS.includes(k));
    expect(usadas).toEqual([]);
  });
});
