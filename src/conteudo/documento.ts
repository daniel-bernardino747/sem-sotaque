// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The terms of use and the privacy policy (step 22, Q25): each a Markdown file
 * here, read on the server and drawn by `src/app/_documento.tsx`. The little
 * Markdown they use: `# ` the title, `## ` a section, `- ` a list item, blank
 * lines between blocks, and `**bold**`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { paragrafos, type Trecho } from './consentimento';

export type Bloco =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'secao'; texto: string }
  | { tipo: 'paragrafo'; trechos: Trecho[] }
  | { tipo: 'lista'; itens: Trecho[][] };

/** The two public documents, each `src/conteudo/<nome>.md`. */
export type NomeDoDocumento = 'termos' | 'privacidade';

const trechos = (texto: string): Trecho[] => paragrafos(texto)[0] ?? [];

/** A document's Markdown as blocks to draw, in order. */
export function blocos(md: string): Bloco[] {
  return md
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b): Bloco => {
      if (b.startsWith('## ')) return { tipo: 'secao', texto: b.slice(3).trim() };
      if (b.startsWith('# ')) return { tipo: 'titulo', texto: b.slice(2).trim() };
      if (b.startsWith('- ')) {
        return { tipo: 'lista', itens: b.split(/\n(?=- )/).map((item) => trechos(item.slice(2).trim())) };
      }
      return { tipo: 'paragrafo', trechos: trechos(b) };
    });
}

/** Read on each render: a text edit needs no code change. */
export function documento(nome: NomeDoDocumento): Bloco[] {
  return blocos(readFileSync(path.join(process.cwd(), 'src', 'conteudo', `${nome}.md`), 'utf8'));
}
