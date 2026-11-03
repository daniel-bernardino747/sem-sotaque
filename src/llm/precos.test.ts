// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { custoUsd, MODELO_PADRAO, PRECOS } from './precos';

const vazio = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

describe('custoUsd', () => {
  it('prices input and output per million tokens', () => {
    const custo = custoUsd(MODELO_PADRAO, {
      ...vazio,
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(custo).toBeCloseTo(PRECOS[MODELO_PADRAO].entrada + PRECOS[MODELO_PADRAO].saida, 6);
  });

  it('prices cache reads at the model rate and 5-minute writes at 1.25x input', () => {
    const p = PRECOS[MODELO_PADRAO];
    const custo = custoUsd(MODELO_PADRAO, {
      ...vazio,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(custo).toBeCloseTo(p.cacheLeitura + p.entrada * 1.25, 6);
  });

  it('prices 1-hour cache writes at 2x input when the breakdown says so', () => {
    const p = PRECOS[MODELO_PADRAO];
    const custo = custoUsd(MODELO_PADRAO, {
      ...vazio,
      cache_creation_input_tokens: 3_000_000,
      cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 2_000_000 },
    });
    expect(custo).toBeCloseTo(p.entrada * 1.25 + p.entrada * 2 * 2, 6);
  });

  it('refuses a model it has no price for, so no call is logged at zero', () => {
    expect(() => custoUsd('claude-inexistente', { ...vazio, input_tokens: 10 })).toThrow(
      /claude-inexistente/,
    );
  });
});
