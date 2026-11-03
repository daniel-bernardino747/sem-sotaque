// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { ehNaoSei, ehPular } from './falas';

describe('ehNaoSei', () => {
  it.each(['sei lá', 'não sei', 'Não lembro.', 'nao sei explicar agora', 'não faço ideia', 'sei la, não lembro direito'])(
    '"%s" is a "não sei"',
    (fala) => expect(ehNaoSei(fala)).toBe(true),
  );

  it.each([
    'uns 30 por mês',
    'sei lá, 400 motoristas',
    'Isso eu não sei te dizer com certeza, não lembro qual era o comportamento exato quando ele caía. O que eu sei é que foram as 2 horas.',
    'não sei se conta, mas fiz um alerta de fraude',
    'sim',
  ])('"%s" is not, and the questioner reads it', (fala) => expect(ehNaoSei(fala)).toBe(false));
});

describe('ehPular', () => {
  it.each(['pula', 'Pula essa!', 'próxima', 'pode pular', 'passa'])('"%s" skips', (fala) => expect(ehPular(fala)).toBe(true));
  it.each(['pula a parte do time, foi só eu', 'não importa muito, mas foi no Pix', 'próxima semana eu vejo'])(
    '"%s" does not',
    (fala) => expect(ehPular(fala)).toBe(false),
  );
});
