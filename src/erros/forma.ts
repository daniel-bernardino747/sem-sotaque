// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * An error as the app keeps it (step 26, docs/decisoes.md): its shape, never
 * its content. The message and the stack stay in the container log: a zod
 * message quotes the input, a model's quotes the résumé and the conversation.
 * Like the `CAMPOS_PERMITIDOS` of a log line elsewhere, a field reaches the
 * database only on purpose: everything else is dropped here. Pure.
 */

export const ORIGENS_ERRO = ['servidor', 'navegador'] as const;
export type OrigemErro = (typeof ORIGENS_ERRO)[number];

/** The only fields an error row holds, besides the session and the date. */
export const CAMPOS_PERMITIDOS = ['origem', 'onde', 'classe', 'codigo', 'digest'] as const;
type Campo = (typeof CAMPOS_PERMITIDOS)[number];

export interface FormaDoErro {
  origem: OrigemErro;
  /** The stage on the server (`import`, `turno`…), the screen in the browser. */
  onde: string;
  /** `erro.name`, or the type of what was thrown when it is not an Error. */
  classe: string;
  /** A known code: the `ErroLlm`'s `motivo`, the `ErroImport`'s `codigo`, an HTTP status, a Postgres or Node code. */
  codigo: string | null;
  /** Next's digest: it ties the browser's error to the server's, and to the container log. */
  digest: string | null;
}

/** The longest a field gets: a route, a class name, a code. */
export const TAMANHO_MAXIMO = 80;

/** A code worth keeping is a short token (`teto`, `23505`, `ECONNREFUSED`), never a sentence. */
const TOKEN = /^[A-Za-z0-9_.:-]{1,40}$/;

function token(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isInteger(valor)) return String(valor);
  return typeof valor === 'string' && TOKEN.test(valor) ? valor : null;
}

function classeDe(erro: unknown): string {
  if (erro instanceof Error) return token(erro.name) ?? 'Error';
  if (erro === null) return 'null';
  return typeof erro;
}

function codigoDe(erro: unknown): string | null {
  if (typeof erro !== 'object' || erro === null) return null;
  const { motivo, codigo, status, code } = erro as { motivo?: unknown; codigo?: unknown; status?: unknown; code?: unknown };
  return token(motivo) ?? token(codigo) ?? token(status) ?? token(code);
}

/** The shape of `erro`, raw as it was caught. */
export function formaDoErro(entrada: { origem: OrigemErro; onde: string; erro: unknown; digest?: string | null }): FormaDoErro {
  const doErro = typeof entrada.erro === 'object' && entrada.erro !== null ? (entrada.erro as { digest?: unknown }).digest : null;
  return soPermitidos({
    origem: entrada.origem,
    onde: entrada.onde,
    classe: classeDe(entrada.erro),
    codigo: codigoDe(entrada.erro),
    digest: token(entrada.digest ?? null) ?? token(doErro),
  });
}

/** Only `CAMPOS_PERMITIDOS`, each a string cut to `TAMANHO_MAXIMO` (or null). Whatever else came is dropped. */
export function soPermitidos(registro: Partial<Record<Campo, unknown>> & Record<string, unknown>): FormaDoErro {
  const texto = (v: unknown) => (typeof v === 'string' && v !== '' ? v.slice(0, TAMANHO_MAXIMO) : null);
  return {
    origem: registro.origem === 'navegador' ? 'navegador' : 'servidor',
    onde: texto(registro.onde) ?? '?',
    classe: texto(registro.classe) ?? '?',
    codigo: texto(registro.codigo),
    digest: texto(registro.digest),
  };
}
