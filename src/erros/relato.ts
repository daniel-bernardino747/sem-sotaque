// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What the browser posts to `/api/erros` when a screen breaks (step 26): the
 * kind, the path of the screen, the class and Next's digest. Never the
 * message, which can carry what the person typed. Safe for the client bundle.
 */
import { TOKEN } from './forma';

export type TipoRelato = 'janela' | 'promessa' | 'limite';

export interface Relato {
  tipo: TipoRelato;
  tela: string;
  classe: string;
  digest?: string;
}

export function relatoDoNavegador(tipo: TipoRelato, erro: unknown, caminho: string): Relato {
  const nome = erro instanceof Error ? erro.name : erro === null ? 'null' : typeof erro;
  // The route takes only tokens: a custom name that is a sentence goes as "Error".
  const classe = TOKEN.test(nome) ? nome : 'Error';
  const digest = typeof erro === 'object' && erro !== null ? (erro as { digest?: unknown }).digest : undefined;
  const tela = caminho.split(/[?#]/)[0] || '/';
  return { tipo, tela, classe, ...(typeof digest === 'string' && TOKEN.test(digest) ? { digest } : {}) };
}

/** At most this many reports per page load: a loop that throws does not flood the route. */
const MAXIMO_POR_PAGINA = 10;
let enviados = 0;

/** Posts the report and forgets it: a report that fails is not reported. */
export function enviarRelato(relato: Relato): void {
  if (enviados >= MAXIMO_POR_PAGINA) return;
  enviados += 1;
  void fetch('/api/erros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(relato),
    keepalive: true,
  }).catch(() => {});
}
