// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use server';

import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { COOKIE_ADMIN, tokenConfere, VALIDADE_S, valorDoCookie } from '@/admin/acesso';
import { exigirAdmin } from '@/admin/servidor';
import { criarTester, salvarNotasDaniel } from '@/db';
import { modo } from '@/modo';

export interface EstadoEntrada {
  erro: string | null;
}

/** The token form. The only action under `/admin` that runs without the cookie. */
export async function entrar(_anterior: EstadoEntrada, form: FormData): Promise<EstadoEntrada> {
  if (modo() === 'local') notFound();
  const digitado = String(form.get('token') ?? '');
  if (!tokenConfere(digitado)) return { erro: 'Token errado (ou ADMIN_TOKEN não configurado no servidor).' };
  (await cookies()).set(COOKIE_ADMIN, valorDoCookie(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: VALIDADE_S,
  });
  redirect('/admin');
}

export async function sair(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_ADMIN, path: '/admin' });
  redirect('/admin');
}

export interface EstadoToken {
  erro: string | null;
  link: string | null;
  apelido: string | null;
}

/** Where the link points: `APP_URL`, or else the host this panel was opened on. */
async function baseDoLink(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocolo}://${host}`;
}

/** The `token:new` shortcut: a new Tester, and their link shown once. */
export async function gerarToken(_anterior: EstadoToken, form: FormData): Promise<EstadoToken> {
  await exigirAdmin();
  const apelido = String(form.get('apelido') ?? '').trim();
  const origem = String(form.get('origem') ?? '').trim();
  const indicadoPor = String(form.get('indicadoPor') ?? '').trim() || undefined;
  if (!apelido || !origem) return { erro: 'Apelido e origem são obrigatórios.', link: null, apelido: null };

  const { token } = await criarTester({ apelido, origem, indicadoPor });
  revalidatePath('/admin');
  return { erro: null, link: `${await baseDoLink()}/s/${token}`, apelido };
}

export interface EstadoNotas {
  salvoEm: string | null;
  erro: string | null;
}

export async function salvarNotas(sessaoId: string, _anterior: EstadoNotas, form: FormData): Promise<EstadoNotas> {
  await exigirAdmin();
  const ok = await salvarNotasDaniel(sessaoId, String(form.get('notas') ?? ''));
  if (!ok) return { salvoEm: null, erro: 'Sessão apagada: não guarda notas.' };
  revalidatePath(`/admin/sessoes/${sessaoId}`);
  return { salvoEm: new Date().toISOString(), erro: null };
}
