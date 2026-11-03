// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { EstadoSessao } from '@/db/schema';

export const NOME_DO_ESTADO: Record<EstadoSessao, string> = {
  novo: 'novo',
  consentiu: 'consentiu',
  importou: 'importou',
  interrogando: 'interrogando',
  gerando: 'gerando',
  pronto: 'pronto',
  encerrado: 'encerrado',
};

export function usd(valor: number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined) return '—';
  return `US$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}

export function dataHora(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
}

export function hora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export const pct = (n: number, de: number) => (de === 0 ? '—' : `${Math.round((100 * n) / de)}%`);

/** A session id from the URL: anything else is a 404, not a database error. */
export const ehUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
