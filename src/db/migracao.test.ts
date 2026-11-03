// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The hand-written migration 0008 (step 14): one generation per session
 * becomes one row per generation, the header moves to `cabecalhos`, and the
 * selections get their generation. Run on a database of its own, migrated up
 * to 0007, with a session in `pronto` written in the old shape.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { migrar, PASTA_MIGRACOES } from './migrate';
import { TEST_DATABASE_URL } from './test-setup';

const semBanco = !inject('bancoDisponivel');

const url = new URL(TEST_DATABASE_URL);
const NOME = `${url.pathname.slice(1)}_migracao`;
const admin = () => {
  const u = new URL(TEST_DATABASE_URL);
  u.pathname = '/postgres';
  return postgres(u.toString(), { max: 1, onnotice: () => {} });
};
const urlDoBanco = () => {
  const u = new URL(TEST_DATABASE_URL);
  u.pathname = `/${NOME}`;
  return u.toString();
};

/** The migrations folder as it was before step 14: up to `ultima`. */
function pastaAte(ultima: string): string {
  const pasta = mkdtempSync(path.join(tmpdir(), 'migracoes-'));
  cpSync(PASTA_MIGRACOES, pasta, { recursive: true });
  const jornal = path.join(pasta, 'meta', '_journal.json');
  const dados = JSON.parse(readFileSync(jornal, 'utf8')) as { entries: { tag: string }[] };
  const fim = dados.entries.findIndex((e) => e.tag === ultima);
  dados.entries = dados.entries.slice(0, fim + 1);
  writeFileSync(jornal, JSON.stringify(dados));
  return pasta;
}

describe.skipIf(semBanco)('migração 0008: gerações com histórico', () => {
  let banco: ReturnType<typeof postgres>;
  const pastas: string[] = [];

  beforeAll(async () => {
    const a = admin();
    await a.unsafe(`drop database if exists "${NOME}"`);
    await a.unsafe(`create database "${NOME}"`);
    await a.end();
    const antiga = pastaAte('0007_avaliador');
    pastas.push(antiga);
    await migrar(urlDoBanco(), antiga);
    banco = postgres(urlDoBanco(), { max: 1, onnotice: () => {} });
  });

  afterAll(async () => {
    await banco?.end();
    for (const p of pastas) rmSync(p, { recursive: true, force: true });
    const a = admin();
    await a.unsafe(`drop database if exists "${NOME}"`);
    await a.end();
  });

  it('turns a delivered session into version 1, with its header, its attempts and its PDF', async () => {
    const [tester] = await banco`insert into testers (token, apelido, origem) values ('tok-migracao', 'Ada', 'teste') returning id`;
    const [sessao] = await banco`insert into sessoes (tester_id, estado) values (${tester.id}, 'pronto') returning id`;
    const [ac] = await banco`insert into accomplishments (sessao_id, tipo, enunciado) values (${sessao.id}, 'engineering', 'Fiz.') returning id, created_at`;
    const [primeira] = await banco`insert into selections (sessao_id, json, tentativa) values (${sessao.id}, '{}', 1) returning id`;
    const [segunda] = await banco`insert into selections (sessao_id, json, tentativa, aprovada) values (${sessao.id}, '{}', 2, true) returning id`;
    await banco`insert into renders (selection_id, pdf, medida) values (${segunda.id}, ${Buffer.from('%PDF-v1')}, '{}')`;
    await banco`
      insert into geracoes (sessao_id, nome, email, linkedin, github, local, iniciada_em, terminada_em, selection_id)
      values (${sessao.id}, 'Ada Teste', 'ada@example.com', 'linkedin.com/in/ada', null, 'Recife, Brazil', now(), now(), ${segunda.id})`;

    await migrar(urlDoBanco());

    const geracoes = await banco`select * from geracoes where sessao_id = ${sessao.id}`;
    expect(geracoes).toHaveLength(1);
    expect(geracoes[0]).toMatchObject({ versao: 1, selection_id: segunda.id });
    expect(geracoes[0].id).toEqual(expect.any(String));
    expect(geracoes[0]).not.toHaveProperty('nome');

    const [cabecalho] = await banco`select * from cabecalhos where sessao_id = ${sessao.id}`;
    expect(cabecalho).toMatchObject({ nome: 'Ada Teste', email: 'ada@example.com', linkedin: 'linkedin.com/in/ada', github: null, local: 'Recife, Brazil' });

    const selections = await banco`select id, geracao_id from selections where sessao_id = ${sessao.id} order by tentativa`;
    expect(selections.map((s) => s.geracao_id)).toEqual([geracoes[0].id, geracoes[0].id]);
    expect(selections.map((s) => s.id)).toEqual([primeira.id, segunda.id]);

    // What `curriculoEntregue(sessao, 1)` reads.
    const [pdf] = await banco`
      select r.pdf from geracoes g
      join renders r on r.selection_id = g.selection_id
      where g.sessao_id = ${sessao.id} and g.versao = 1`;
    expect(Buffer.from(pdf.pdf).toString()).toBe('%PDF-v1');

    // The Corpus that was there is not newer than the generation that read it.
    const [corpo] = await banco`select atualizado_em, created_at from accomplishments where id = ${ac.id}`;
    expect(corpo.atualizado_em).toEqual(corpo.created_at);
  });
});
