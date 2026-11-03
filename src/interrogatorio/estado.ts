// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What the interrogation knows at the start of a turn, built from the database
 * and nothing else: what is closed, how many questions each record has had, the
 * coverage the person sees, and the one subject the questioner reads. `Refs`
 * (`af1`, `ac3`, `l7`) is what the generation cites records by.
 */
import type { AccomplishmentDoCorpus, Affiliation, Corpus, LinhaOriginal, Mensagem } from '@/db';

/** Questions about one record before the server closes it on its own (skipped). */
export const LIMITE_DURO = 10;

export type Registro =
  | { tipo: 'affiliation'; id: string }
  | { tipo: 'accomplishment'; id: string }
  | { tipo: 'linha'; id: string };

/** Short names for the session's records, stable for a turn and across turns (creation order). */
export class Refs {
  private porRef = new Map<string, Registro>();
  private porId = new Map<string, string>();
  private contagem = { affiliation: 0, accomplishment: 0, linha: 0 };

  constructor(corpus: Corpus, linhas: LinhaOriginal[]) {
    // Affiliations by creation, not by `ordem`, so a new one never renames the others.
    [...corpus.affiliations]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.ordem - b.ordem)
      .forEach((a) => this.adicionar({ tipo: 'affiliation', id: a.id }));
    corpus.accomplishments.forEach((a) => this.adicionar({ tipo: 'accomplishment', id: a.id }));
    linhas.forEach((l) => this.adicionar({ tipo: 'linha', id: l.id }));
  }

  adicionar(registro: Registro): string {
    const existente = this.porId.get(registro.id);
    if (existente) return existente;
    const prefixo = { affiliation: 'af', accomplishment: 'ac', linha: 'l' }[registro.tipo];
    const ref = `${prefixo}${++this.contagem[registro.tipo]}`;
    this.porRef.set(ref, registro);
    this.porId.set(registro.id, ref);
    return ref;
  }

  registro(ref: string): Registro | undefined {
    return this.porRef.get(ref.trim());
  }

  ref(id: string): string | undefined {
    return this.porId.get(id);
  }
}

/** A degree or a technical course: it closes with its year, never with a month or a description. */
export const ehFormacao = (a: { tipo?: Affiliation['tipo'] }) => a.tipo === 'graduacao' || a.tipo === 'tecnico';

export function affiliationFechada(a: Affiliation): boolean {
  if (a.pulado) return true;
  if (ehFormacao(a)) return Boolean(a.organizacao.trim() && a.cargo.trim() && a.anoConclusao);
  return Boolean(a.periodoConfirmado && a.periodoInicio && a.descricaoPublica?.trim());
}

export function accomplishmentFechado(a: AccomplishmentDoCorpus): boolean {
  return a.pulado || a.metrics.length > 0;
}

export interface Progresso {
  fechadas: number;
  total: number;
  /** 0–100, from the evaluator: what the screen shows. */
  cobertura: number;
}

/**
 * Every Affiliation and every Accomplishment counts as one thing, closed or
 * open (the "terminei" warning counts what is open); the screen shows the
 * evaluator's coverage.
 */
export function progresso(corpus: Corpus, cobertura = 0): Progresso {
  const fechadas =
    corpus.affiliations.filter(affiliationFechada).length +
    corpus.accomplishments.filter(accomplishmentFechado).length;
  return { fechadas, total: corpus.affiliations.length + corpus.accomplishments.length, cobertura };
}

export interface Contagem {
  perguntas: number;
  naoSei: number;
}

/**
 * Per record id: how many questions the assistant asked about it, and how many
 * "não sei" answers followed them.
 */
export function contagemPorRegistro(mensagens: Mensagem[]): Map<string, Contagem> {
  const contagens = new Map<string, Contagem>();
  const de = (id: string) => {
    let c = contagens.get(id);
    if (!c) contagens.set(id, (c = { perguntas: 0, naoSei: 0 }));
    return c;
  };
  let foco: string | null = null;
  for (const m of mensagens) {
    if (m.papel === 'assistente') {
      foco = m.accomplishmentId ?? m.affiliationId;
      if (foco) de(foco).perguntas++;
    } else if (m.papel === 'pessoa' && foco && m.marcadores.includes('nao_sei')) {
      de(foco).naoSei++;
    }
  }
  return contagens;
}

const ou = (valor: string | null | undefined, falta = '(falta)') => (valor?.trim() ? valor : falta);

function periodo(a: Affiliation): string {
  const inicio = a.periodoInicio ?? '?';
  const fim = a.periodoFim ?? (a.periodoConfirmado ? 'atual' : '?');
  const status = a.periodoConfirmado ? 'confirmado' : 'não confirmado';
  return `${inicio} → ${fim} (${status}; como veio no currículo: ${a.periodoOriginal ? `"${a.periodoOriginal}"` : 'sem período'})`;
}

/** The subject the questioner reads, the way `src/avaliador/plano.ts` names it. */
export interface AssuntoLido {
  tipo: 'accomplishment' | 'affiliation' | 'anotacao' | 'novo' | 'oferta' | 'lacuna';
  id: string;
}

/**
 * The one subject the questioner sees (decision 5 of step 10): the record, its
 * company's name, role and stack, and the notes about it. No other record, no
 * title of one, no progress.
 */
export function descreverAssunto(dados: {
  corpus: Corpus;
  linhas: LinhaOriginal[];
  assunto: AssuntoLido;
  /** Notes already tied to this accomplishment, and the text of a note subject. */
  anotacoes: { id: string; texto: string; accomplishmentId: string | null }[];
  /** A Vaga's gap (step 16): what the posting asks, in its words. */
  requisito?: string;
}): string {
  const { corpus, linhas, assunto, anotacoes } = dados;
  if (assunto.tipo === 'accomplishment') {
    const a = corpus.accomplishments.find((x) => x.id === assunto.id);
    if (!a) return '(o registro não existe mais)';
    const af = a.affiliation;
    const partes = [
      `Um accomplishment (tipo ${a.tipo}).`,
      `enunciado: ${a.enunciado}`,
      ...linhas.filter((l) => l.accomplishmentId === a.id).map((l) => `linha do currículo: "${l.texto}"`),
      ...(a.metrics.length
        ? a.metrics.map((m) => `resultado gravado (${m.origem}): ${m.texto}${m.ancora ? ` — âncora: ${m.ancora}` : ''}`)
        : ['resultado gravado: nenhum']),
      `importância para a pessoa: ${a.importanciaParaPessoa ?? 'não perguntada'}`,
      af
        ? `onde: ${af.confidencial ? `${af.descricaoPublica} (confidencial: nunca diga o nome)` : af.organizacao} — cargo: ${af.cargo} — stack: ${af.stack.length ? af.stack.join(', ') : '(nenhuma citada)'}`
        : 'onde: fora de qualquer empresa',
    ];
    if (a.adiadoVoltou) partes.push('Este assunto já foi aberto antes e ficou sem resultado: ele volta uma vez só.');
    const notas = anotacoes.filter((n) => n.accomplishmentId === a.id);
    if (notas.length) partes.push('O que a pessoa disse sobre isto antes, em outro assunto (já é este registro: não anote de novo):', ...notas.map((n) => `- "${n.texto}"`));
    return partes.join('\n');
  }
  if (assunto.tipo === 'affiliation') {
    const af = corpus.affiliations.find((x) => x.id === assunto.id);
    if (!af) return '(o registro não existe mais)';
    if (ehFormacao(af)) {
      return [
        `A formação da pessoa (${af.tipo === 'tecnico' ? 'curso técnico' : 'graduação'}).`,
        `instituição: ${af.organizacao}`,
        `curso: ${af.cargo}`,
        `período como veio no currículo: ${af.periodoOriginal ? `"${af.periodoOriginal}"` : 'sem período'}`,
        `ano de conclusão: ${af.anoConclusao ? `${af.anoConclusao}${af.cursando ? ' (previsão: ainda cursando)' : ''}` : '(falta)'}`,
      ].join('\n');
    }
    return [
      'O fim desta empresa: as perguntas sobre ela, num bloco curto ("Antes de sair da <empresa>: ...").',
      `empresa: ${af.organizacao} — cargo: ${af.cargo}`,
      `período: ${periodo(af)}`,
      `descrição para um recrutador estrangeiro: ${ou(af.descricaoPublica)}`,
      `confidencial: ${af.confidencial ? 'sim (o currículo usa a descrição, nunca o nome)' : 'não perguntado ou não'}`,
      `stack: ${af.stack.length ? af.stack.join(', ') : '(nenhuma citada)'}`,
    ].join('\n');
  }
  if (assunto.tipo === 'anotacao') {
    const nota = anotacoes.find((n) => n.id === assunto.id);
    return [
      'Algo que a pessoa citou antes, fora do assunto daquela hora, e que não está no currículo:',
      `"${nota?.texto ?? ''}"`,
      'Entenda o que é e, se for trabalho dela, crie o registro (criar_accomplishment; criar_affiliation antes, se a empresa não está na lista).',
      '<empresas_da_pessoa>',
      ...corpus.affiliations.filter((a) => a.tipo === 'emprego').map((a) => `- ${a.organizacao}`),
      '</empresas_da_pessoa>',
    ].join('\n');
  }
  if (assunto.tipo === 'lacuna') {
    // The requirement and the companies with their stack: nothing else of the Vaga (decision 5 of step 10).
    return [
      'Algo que a vaga pede e que nenhum registro da pessoa cobre. Ela marcou que já usou:',
      `"${dados.requisito ?? ''}"`,
      'Pergunte onde e como ela usou. Um trabalho com cenário vira registro (criar_accomplishment; criar_affiliation antes, se a empresa não está na lista). Uma ferramenta do dia a dia numa empresa vai para a stack dela (acrescentar_stack). Se ela disser que no fim não usou, marcar_pulado.',
      '<empresas_da_pessoa>',
      ...corpus.affiliations
        .filter((a) => a.tipo === 'emprego')
        .map((a) => `- ${a.organizacao} — stack: ${a.stack.length ? a.stack.join(', ') : '(nenhuma citada)'}`),
      '</empresas_da_pessoa>',
    ].join('\n');
  }
  if (assunto.tipo === 'novo') {
    return [
      'A pessoa voltou para contar algo que ainda não está no currículo: um trabalho, um projeto, um resultado.',
      'Pergunte o que ela quer contar. Quando entender o que é e for trabalho dela, crie o registro (criar_accomplishment; criar_affiliation antes, se a empresa não está na lista).',
      '<empresas_da_pessoa>',
      ...corpus.affiliations.filter((a) => a.tipo === 'emprego').map((a) => `- ${a.organizacao}`),
      '</empresas_da_pessoa>',
    ].join('\n');
  }
  return 'A oferta de fim.';
}
