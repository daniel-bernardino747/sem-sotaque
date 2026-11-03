// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LinksLegais } from './_documento';

describe('the footer links', () => {
  it('offer the source code, as the AGPL asks of a network service', () => {
    const html = renderToStaticMarkup(createElement(LinksLegais));
    expect(html).toContain('href="/termos"');
    expect(html).toContain('href="/privacidade"');
    expect(html).toContain('href="https://github.com/daniel-bernardino747/sem-sotaque"');
    expect(html).toContain('Código-fonte');
  });
});
