// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `npm run gerar -- <persona> [--sessao <id>] [--de-novo] [--vaga <id>]`: the
 * real generation (selection, checks, render, Critic, rewrites) on a session
 * of `npm run simular`, in the dev database. Without `--sessao`, the newest
 * session of that persona. `--de-novo` generates a new Version of a session
 * already delivered (step 14: the state stays where it is). `--vaga` generates
 * a Version of that Vaga's résumé instead (step 17), with its map; the Vaga
 * must be confirmed, as `simular -- vaga` leaves it.
 *
 * Writes to `storage/geracoes/` (outside git) the PDF and a report: the
 * attempts with their violations, the cost and time per stage, a Vaga's map
 * and interview questions, the "antes × depois" and the PDF's text as
 * `pdftotext` reads it. Exits 1 when the delivered résumé breaks a
 * deterministic check or is not one page.
 *
 * Spends real money: one selection, a Critic per attempt, a rewrite between
 * attempts, and for a Vaga the map.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { and, desc, eq, gte } from 'drizzle-orm';

import {
  criarGeracao,
  curriculoEntregue,
  gravarCabecalho,
  linhasDaSessao,
  tentativasDaSessao,
  ultimaGeracao,
  vagaDaSessao,
  type Cabecalho,
} from '../src/db';
import { db, fecharDb } from '../src/db/client';
import { chamadasLlm, geracoes, sessoes, testers } from '../src/db/schema';
import { ehStack, linhaNaPagina } from '../src/geracao/checagens';
import { gerarCurriculo, type Violacoes } from '../src/geracao/pipeline';
import { textoDoPdf } from '../src/import/texto';
import { PREFIXO_ASSINATURA } from '../src/llm/precos';
import type { Selection } from '../src/render';

/** Invented people, as the personas are. */
const CABECALHOS: Record<string, Cabecalho> = {
  'sabe-os-numeros': { nome: 'Rodrigo Inventado', email: 'rodrigo@example.com', linkedin: 'linkedin.com/in/rodrigo-inventado', github: 'github.com/rodrigo-inventado', local: 'Recife, Brazil' },
  'nao-sei': { nome: 'Lívia Inventada', email: 'livia@example.com', linkedin: 'linkedin.com/in/livia-inventada', github: null, local: 'Belo Horizonte, Brazil' },
  'uma-palavra': { nome: 'Rodrigo Apressado', email: 'apressado@example.com', linkedin: 'linkedin.com/in/rodrigo-apressado', github: null, local: 'Recife, Brazil' },
  vaga: { nome: 'Rodrigo Inventado', email: 'rodrigo@example.com', linkedin: 'linkedin.com/in/rodrigo-inventado', github: null, local: 'Recife, Brazil' },
};

const args = process.argv.slice(2);
const persona = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--sessao' && args[i - 1] !== '--vaga');
const sessaoArg = args.includes('--sessao') ? args[args.indexOf('--sessao') + 1] : undefined;
const vagaArg = args.includes('--vaga') ? args[args.indexOf('--vaga') + 1] : undefined;
const deNovo = args.includes('--de-novo');

if (!persona || !(persona in CABECALHOS) || (args.includes('--vaga') && !vagaArg)) {
  console.error(`uso: npm run gerar -- <${Object.keys(CABECALHOS).join('|')}> [--sessao <id>] [--de-novo] [--vaga <id>]`);
  process.exit(2);
}

async function sessaoDaPersona(): Promise<string> {
  if (sessaoArg) return sessaoArg;
  const [linha] = await db()
    .select({ id: sessoes.id })
    .from(sessoes)
    .innerJoin(testers, eq(testers.id, sessoes.testerId))
    .where(and(eq(testers.origem, 'simulacao'), eq(testers.apelido, `simulação ${persona}`)))
    .orderBy(desc(sessoes.createdAt))
    .limit(1);
  if (!linha) throw new Error(`no session of ${persona}: run npm run simular -- ${persona} first`);
  return linha.id;
}

async function main() {
  const sessaoId = await sessaoDaPersona();
  const [sessao] = await db().select().from(sessoes).where(eq(sessoes.id, sessaoId));
  const vaga = vagaArg ? await vagaDaSessao(sessaoId, vagaArg) : null;
  if (vagaArg && !vaga) throw new Error(`no live Vaga ${vagaArg} in session ${sessaoId}`);
  if (!vaga && sessao.estado !== 'gerando' && !deNovo) {
    throw new Error(`session ${sessaoId} is ${sessao.estado}; use --de-novo to generate a new version`);
  }
  const vagaId = vaga?.id ?? null;
  await gravarCabecalho(sessaoId, CABECALHOS[persona!]);
  const aberta = await ultimaGeracao(sessaoId, vagaId);
  const geracao = aberta && !aberta.terminadaEm ? aberta : await criarGeracao(sessaoId, vagaId);
  if (!geracao) throw new Error(`session ${sessaoId}: could not open a generation${vaga ? ' of the Vaga (confirmed? generations left?)' : ''}`);

  console.log(`sessão ${sessaoId} (${persona}): gerando a versão ${geracao.versao}${vaga ? ` da vaga ${vaga.cargo ?? vaga.id}` : ''}…`);
  const inicio = new Date();
  const tempos: Record<string, number> = {};
  let atual: { etapa: string; t: number } | null = null;
  const r = await gerarCurriculo(sessaoId, geracao.id, {
    aoEtapa: (etapa) => {
      const agora = Date.now();
      if (atual) tempos[atual.etapa] = (tempos[atual.etapa] ?? 0) + (agora - atual.t);
      atual = { etapa, t: agora };
      console.log(`  ${((agora - inicio.getTime()) / 1000).toFixed(0)} s · ${etapa}`);
    },
  });
  const fim = Date.now();
  const ultima = atual as { etapa: string; t: number } | null;
  if (ultima) tempos[ultima.etapa] = (tempos[ultima.etapa] ?? 0) + (fim - ultima.t);
  const duracao = (fim - inicio.getTime()) / 1000;

  const [entregue, tentativas, linhas, chamadas, [gravada]] = await Promise.all([
    curriculoEntregue(sessaoId, geracao.versao, vagaId),
    tentativasDaSessao(sessaoId),
    linhasDaSessao(sessaoId),
    db().select().from(chamadasLlm).where(and(eq(chamadasLlm.sessaoId, sessaoId), gte(chamadasLlm.createdAt, inicio))),
    db().select().from(geracoes).where(eq(geracoes.id, geracao.id)),
  ]);
  const desta = tentativas.filter((t) => t.createdAt >= inicio).reverse();
  const selection = entregue!.selection.json as Selection;
  const violacoes = entregue!.selection.violacoes as Violacoes;
  const texto = await textoDoPdf(entregue!.pdf);

  const porEtapa = new Map<string, { chamadas: number; custo: number; ms: number }>();
  for (const c of chamadas) {
    const e = porEtapa.get(c.etapa) ?? { chamadas: 0, custo: 0, ms: 0 };
    e.chamadas++;
    e.custo += c.custoUsd;
    e.ms += c.duracaoMs;
    porEtapa.set(c.etapa, e);
  }
  const custo = chamadas.reduce((s, c) => s + c.custoUsd, 0);

  const pasta = path.join('storage', 'geracoes');
  mkdirSync(pasta, { recursive: true });
  const base = path.join(pasta, `${persona}${vaga ? '-vaga' : ''}-${inicio.toISOString().replace(/[:.]/g, '-')}`);
  writeFileSync(`${base}.pdf`, entregue!.pdf);

  const md: string[] = [
    `# Geração: ${persona}`,
    '',
    `- Sessão: ${sessaoId}`,
    `- Tentativas: ${r.tentativas}; entregue: a tentativa ${entregue!.selection.tentativa}; aprovada: ${r.aprovada ? 'sim' : 'não (marcada para revisão)'}`,
    `- Tempo: ${duracao.toFixed(0)} s (${Object.entries(tempos).map(([e, ms]) => `${e} ${(ms / 1000).toFixed(0)} s`).join(', ')})`,
    chamadas.some((c) => c.modelo.startsWith(PREFIXO_ASSINATURA))
      ? '- Custo: não medido (pela assinatura, LLM_BACKEND=assinatura)'
      : `- Custo: US$ ${custo.toFixed(4)}`,
    ...[...porEtapa].map(([e, x]) => `  - ${e}: ${x.chamadas} chamadas, US$ ${x.custo.toFixed(4)}, ${(x.ms / 1000).toFixed(0)} s`),
    `- Preenchimento insuficiente: ${violacoes.preenchimento_insuficiente ? `sim (${violacoes.preenchimento_insuficiente.fill}%: ${violacoes.preenchimento_insuficiente.motivo})` : 'não'}`,
    ...violacoes.notas.map((n) => `- Nota: ${n}`),
    '',
    '## Tentativas',
    '',
  ];
  for (const t of desta) {
    const v = t.violacoes as Violacoes;
    md.push(`### Tentativa ${t.tentativa}${t.aprovada ? ' (aprovada)' : ''}${t.id === entregue!.selection.id ? ' — entregue' : ''}`, '');
    for (const p of [...v.checagens, ...v.medida, ...v.critico]) {
      md.push(`- [${p.id}] ${p.origem}/${p.regra}${p.gravidade ? ` (${p.gravidade})` : ''}: ${p.mensagem}${p.sugestao ? ` → "${p.sugestao}"` : ''}`);
    }
    if (v.mantidas) for (const [id, motivo] of Object.entries(v.mantidas)) md.push(`- mantida [${id}]: ${motivo}`);
    md.push('');
  }
  if (vaga) {
    md.push('## Mapa da vaga', '');
    if (!gravada.mapa) md.push('_Sem mapa: a chamada do mapa falhou._');
    for (const m of gravada.mapa ?? []) {
      const requisito = vaga.requisitos.find((r) => r.id === m.requisitoId);
      const linha = linhaNaPagina(m, selection) ?? '_não coberto_';
      md.push(`- **${requisito?.texto ?? m.requisitoId}** (${requisito?.tipo ?? '?'}): ${linha}`);
    }
    md.push('', '## Perguntas de entrevista (guardadas, nunca mostradas ao Tester)', '');
    for (const p of gravada.perguntasEntrevista ?? []) md.push(`- ${p.pergunta}${p.accomplishmentId ? '' : ' _(summary)_'}`);
    md.push('');
  }
  md.push('## Antes × depois', '');
  for (const s of selection.sections) {
    for (const g of s.groups) {
      md.push(`### ${[g.heading?.role, g.heading?.organisation, g.heading?.period].filter(Boolean).join(' · ')}`, '');
      for (const e of g.entries.filter((x) => !ehStack(x))) {
        const antes = [...new Set(linhas.filter((l) => l.accomplishmentId === e.source).map((l) => l.texto))];
        md.push(`- **Antes:** ${antes.length ? antes.join(' / ') : '_novo: veio das respostas_'}`, `  **Depois:** ${e.text}`);
      }
      md.push('');
    }
  }
  md.push('## O PDF em texto (pdftotext)', '', '```', texto, '```', '');
  writeFileSync(`${base}.md`, md.join('\n'));

  const umaPagina = !violacoes.medida.some((p) => p.regra === 'pagina_longa');
  console.log(`\n${r.aprovada ? 'aprovada' : 'NÃO aprovada (revisar)'} em ${r.tentativas} tentativa(s); ${duracao.toFixed(0)} s; US$ ${custo.toFixed(4)}`);
  console.log(`checagens determinísticas no entregue: ${violacoes.checagens.length}${violacoes.checagens.map((p) => `\n  [${p.id}] ${p.regra}: ${p.mensagem}`).join('')}`);
  console.log(`preenchimento insuficiente: ${violacoes.preenchimento_insuficiente ? `sim (${violacoes.preenchimento_insuficiente.fill}%)` : 'não'}`);
  console.log(`relatório: ${base}.md\nPDF: ${base}.pdf`);
  if (violacoes.checagens.length || !umaPagina) process.exitCode = 1;
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(fecharDb);
