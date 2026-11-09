// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { LIMITE_ARQUIVO } from '@/arquivo-do-corpus';
import { COOKIE_CONTA } from '@/conta/acesso';
import { cancelarAntesDeApagar } from '@/assinatura/cancelar';
import { cobranca } from '@/assinatura/stripe';
import { entradaAtual, sessaoAtual, sessaoComAcesso } from '@/conta/servidor';
import {
  apagarSessao,
  assinaturaDaConta,
  apagarVaga as esvaziarVaga,
  confirmarVaga as gravarConfirmacao,
  criarVaga,
  definirLeitura,
  ErroArquivoDoCorpus,
  ErroCorpusNaoVazio,
  ErroEstadoSessao,
  gravarCabecalho,
  gravarOpiniao,
  importarCorpusDeArquivo,
  iniciarInterrogatorio,
  reaceitarConsentimento as gravarReaceite,
  registrarAbertura,
  registrarConsentimento,
  registrarIndicacoes,
  responderConsentimentoVagas,
  sair,
  situacao,
  vagaDaSessao,
  vagasLiberadas,
  type Sessao,
} from '@/db';
import { abrirConversaDaVaga, contarAlgoNovo, emRetomada, retomar } from '@/avaliador';
import { CONSENTIMENTO_VERSAO, REACEITE_VERSAO } from '@/conteudo/consentimento';
import { anotarAtrito, registrarErro } from '@/erros';
import { ErroImport, importarCurriculo, type EntradaImport } from '@/import';
import { lerCabecalho } from '@/geracao/cabecalho';
import { garantirGeracao, novaGeracao } from '@/geracao/segundo-plano';
import { emSerie } from '@/interrogatorio/trava';
import { lerIndicacoes, lerOpiniao, type Lido } from '@/sessao/fechamento';
import { encerrarInterrogatorio } from '@/interrogatorio/turno';
import { garantirLeitura } from '@/vaga';
import { lerConfirmacao, lerVagaColada } from '@/vaga/entrada';
import { modo } from '@/modo';

/**
 * The signed-in session every action works on, read again on each call (an
 * action is a public endpoint; it never trusts a session id from the page).
 * Signed out, or with the data erased, goes to `/entrar`; without a
 * subscription, to the home and its paywall (step 21). Erasing and signing
 * out need no subscription.
 */
async function sessaoDaAcao(): Promise<Sessao> {
  const sessao = await sessaoComAcesso();
  if (sessao === 'sem_conta') redirect('/entrar');
  if (sessao === 'sem_acesso') redirect('/casa');
  return sessao;
}

/**
 * The person has the page open in a browser. Called from the page after it
 * loads, not while rendering it, so a link preview (WhatsApp fetches the link
 * to draw one) does not count as the person opening it.
 */
export async function abriuOLink(): Promise<void> {
  // Called from an effect: signed out, it records nothing and sends nowhere.
  const sessao = await sessaoAtual();
  if (sessao) await registrarAbertura(sessao.id);
}

/** "Sair": this browser's sign-in ends, on the server too. */
export async function sairDaConta(): Promise<void> {
  const jar = await cookies();
  const acesso = jar.get(COOKIE_CONTA)?.value;
  if (acesso) await sair(acesso);
  jar.delete({ name: COOKIE_CONTA, path: '/' });
  redirect('/entrar');
}

// ---- a assinatura (passo 21) --------------------------------------------------

export interface EstadoAssinar {
  erro: boolean;
}

/**
 * "Assinar": a Checkout Session for the account, and off to Stripe. An
 * account with a live subscription (a failed payment too: that is fixed in
 * the portal) never gets a second one. After one ended, the same Stripe
 * customer keeps the billing history in one place.
 */
export async function assinar(_anterior: EstadoAssinar, _form: FormData): Promise<EstadoAssinar> {
  const entrada = await entradaAtual();
  if (!entrada) redirect('/entrar');
  if (modo() === 'local') redirect('/casa');
  const assinatura = await assinaturaDaConta(entrada.conta.id);
  if (situacao(assinatura) !== 'sem') redirect('/casa');
  let url: string;
  try {
    url = await cobranca().checkout({
      contaId: entrada.conta.id,
      email: entrada.conta.email,
      cliente: assinatura?.stripeCustomerId ?? null,
    });
  } catch (erro) {
    await registrarErro({ origem: 'servidor', onde: 'checkout', erro, sessaoId: entrada.sessao?.id, log: 'assinar: the checkout session failed' });
    return { erro: true };
  }
  redirect(url);
}

/** "Gerenciar assinatura": the Customer Portal (card, cancel, invoices), where Stripe does it all. */
export async function gerirAssinatura(): Promise<void> {
  const entrada = await entradaAtual();
  if (!entrada) redirect('/entrar');
  if (modo() === 'local') redirect('/casa');
  const assinatura = await assinaturaDaConta(entrada.conta.id);
  if (!assinatura) redirect('/casa');
  redirect(await cobranca().portal(assinatura.stripeCustomerId));
}

/**
 * The consent form: without the box ticked nothing changes and the page shows
 * again. "Pode ler" is its own box (step 22), never required.
 */
export async function aceitarConsentimento(form: FormData): Promise<void> {
  const sessao = await sessaoDaAcao();
  if (form.get('aceito') === 'sim') {
    await registrarConsentimento(sessao.id, CONSENTIMENTO_VERSAO, form.get('pode_ler') === 'sim');
  }
  redirect('/casa');
}

/** Consent v2 shown again to a v1 session mid-interrogation: yes or no, and the chat goes on. */
export async function reaceitarConsentimento(form: FormData): Promise<void> {
  const sessao = await sessaoDaAcao();
  const resposta = form.get('resposta');
  if (resposta === 'sim' || resposta === 'nao') {
    await gravarReaceite(sessao.id, REACEITE_VERSAO, resposta === 'sim');
  }
  redirect('/casa');
}

/**
 * "Pode ler" / "Não quero mais" at the home (step 22): the reading opt-in on
 * or off. The panel reads it on every request, so it takes effect at once.
 * Like erasing, it needs no subscription: a lapsed one still decides who reads.
 */
export async function mudarLeitura(form: FormData): Promise<void> {
  const sessao = (await entradaAtual())?.sessao;
  if (!sessao) redirect('/entrar');
  const leitura = form.get('leitura');
  if (leitura === 'ligar' || leitura === 'desligar') await definirLeitura(sessao.id, leitura === 'ligar');
  redirect('/casa');
}

export interface EstadoApagar {
  erro: boolean;
}

/**
 * "Apagar meus dados", after the second confirmation: the subscription is
 * canceled at Stripe (step 21), then the session, the account and every
 * sign-in of it go (step 20), and the browser shows the erased page. If
 * Stripe fails, nothing is erased and the form says so. No subscription is
 * needed to erase.
 */
export async function apagarDados(_anterior: EstadoApagar, _form: FormData): Promise<EstadoApagar> {
  const entrada = await entradaAtual();
  const sessao = entrada?.sessao;
  if (!entrada || !sessao) redirect('/entrar');
  try {
    await cancelarAntesDeApagar(entrada.conta.id);
  } catch (erro) {
    await registrarErro({ origem: 'servidor', onde: 'cancelar_assinatura', erro, sessaoId: sessao.id, log: 'apagar: canceling the subscription failed' });
    return { erro: true };
  }
  await apagarSessao(sessao.id);
  (await cookies()).delete({ name: COOKIE_CONTA, path: '/' });
  redirect('/apagado');
}

export interface EstadoEnvio {
  erro: string | null;
  /** What was pasted, so an error does not cost the person their paste (React resets the form). */
  texto: string;
}

/**
 * The import form: a PDF or pasted text. A problem with what was sent comes
 * back as a message on the form; success moves the session to `importou` and
 * the conversation shows the result.
 */
export async function enviarCurriculo(
  _anterior: EstadoEnvio,
  form: FormData,
): Promise<EstadoEnvio> {
  const texto = form.get('texto');
  const colado = typeof texto === 'string' ? texto : '';
  const falhou = (erro: string): EstadoEnvio => ({ erro, texto: colado });

  const sessao = await sessaoDaAcao();
  if (sessao.estado !== 'consentiu') redirect('/casa/conversa');

  const arquivo = form.get('pdf');
  let entrada: EntradaImport;
  if (arquivo instanceof File && arquivo.size > 0) {
    entrada = { formato: 'pdf', pdf: Buffer.from(await arquivo.arrayBuffer()) };
  } else if (colado.trim()) {
    entrada = { formato: 'texto', texto: colado };
  } else {
    return falhou('Envie o PDF do currículo ou cole o texto.');
  }

  try {
    await importarCurriculo(sessao.id, entrada);
  } catch (erro) {
    if (!(erro instanceof ErroEstadoSessao)) {
      // A file it cannot read is recorded too: it is where people get stuck (step 26).
      await registrarErro({ origem: 'servidor', onde: 'import', erro, sessaoId: sessao.id, log: `import failed for session ${sessao.id}:` });
      return falhou(erro instanceof ErroImport ? erro.message : 'Não consegui ler seu currículo agora. Tente de novo em alguns minutos.');
    }
  }
  redirect('/casa/conversa');
}

export interface EstadoArquivo {
  erro: string | null;
}

/**
 * "Tenho um arquivo do sem-sotaque" (step 27): a Corpus file into the empty
 * Corpus, behind the subscription like the PDF. A file that does not pass the
 * check comes back with the reason; nothing is written. A session that already
 * has a Corpus never sees the form: a stale tab goes to the conversation.
 */
export async function enviarArquivoDoCorpus(_anterior: EstadoArquivo, form: FormData): Promise<EstadoArquivo> {
  const sessao = await sessaoDaAcao();
  if (sessao.estado !== 'consentiu') redirect('/casa/conversa');

  const arquivo = form.get('corpus');
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: 'Escolha o arquivo .json que você baixou em “Baixar meu Corpus”.' };
  if (arquivo.size > LIMITE_ARQUIVO) return { erro: 'Este arquivo passa de 5 MB: não é um Corpus do sem-sotaque.' };

  try {
    await importarCorpusDeArquivo(sessao.id, await arquivo.text());
  } catch (erro) {
    if (!(erro instanceof ErroEstadoSessao || erro instanceof ErroCorpusNaoVazio)) {
      // A refused file is recorded too, by its class only: it is where people get stuck (step 26).
      await registrarErro({ origem: 'servidor', onde: 'import', erro, sessaoId: sessao.id, log: `corpus file import failed for session ${sessao.id}:` });
      return { erro: erro instanceof ErroArquivoDoCorpus ? erro.message : 'Não consegui importar o arquivo agora. Tente de novo em alguns minutos.' };
    }
  }
  redirect('/casa/conversa');
}

/** "Começar as perguntas" on the import result. */
export async function comecarPerguntas(): Promise<void> {
  const sessao = await sessaoDaAcao();
  await iniciarInterrogatorio(sessao.id);
  redirect('/casa/conversa');
}

/**
 * "Terminei" on the chat, after the page has said how many things are still
 * open: the interrogation ends as it is and the page moves on to the résumé.
 * In a retomada nothing ends: the person goes back home.
 */
export async function terminar(): Promise<void> {
  const sessao = await sessaoDaAcao();
  if (sessao.estado === 'interrogando') {
    // After a turn in flight, so nothing writes to the Corpus once it has ended.
    const { id } = sessao;
    await emSerie(id, () => encerrarInterrogatorio(id, 'pessoa'));
    redirect('/casa/curriculo');
  }
  redirect('/casa');
}

/**
 * "Continuar a conversa" on the home. Once the interrogation has ended, it
 * opens a retomada (the open queue, the offer to stop allowed again); before,
 * the chat just goes on.
 */
export async function continuarConversa(): Promise<void> {
  const sessao = await sessaoDaAcao();
  if (emRetomada(sessao.estado) && sessao.estado !== 'gerando') {
    const { id } = sessao;
    await emSerie(id, () => retomar(id));
  }
  redirect('/casa/conversa');
}

/** "Contar algo novo" on the home: a subject for a record that is not there yet, in front of the queue. */
export async function contarAlgo(): Promise<void> {
  const sessao = await sessaoDaAcao();
  if (['interrogando', 'pronto', 'encerrado'].includes(sessao.estado)) {
    const { id } = sessao;
    await emSerie(id, () => contarAlgoNovo(id));
  }
  redirect('/casa/conversa');
}

export interface EstadoCabecalho {
  erro: string | null;
  /** What was typed, so an error does not cost the person the form. */
  valores: Record<string, string>;
}

/**
 * The header form on the résumé page, before the first generation and as
 * "gerar de novo" after it: saved, then a new Version starts in the background
 * and the page shows the waiting screen. Only once the interrogation has ended.
 */
export async function enviarCabecalho(_anterior: EstadoCabecalho, form: FormData): Promise<EstadoCabecalho> {
  const sessao = await sessaoDaAcao();
  if (!emRetomada(sessao.estado)) redirect('/casa');
  const lido = lerCabecalho(form);
  if (!lido.ok) {
    const valores = Object.fromEntries(['nome', 'email', 'linkedin', 'github', 'local'].map((k) => [k, String(form.get(k) ?? '')]));
    return { erro: lido.erro, valores };
  }
  if (await gravarCabecalho(sessao.id, lido.cabecalho)) {
    // A second send while the first run goes on starts nothing new.
    if (!(await novaGeracao(sessao.id))) await garantirGeracao(sessao.id);
  }
  redirect('/casa/curriculo');
}

/** "Gerar de novo" on the home: a new Version with the header already given. */
export async function gerarDeNovo(): Promise<void> {
  const sessao = await sessaoDaAcao();
  if (emRetomada(sessao.estado)) await novaGeracao(sessao.id);
  redirect('/casa/curriculo');
}

/** "Tentar de novo" after a generation failed: the same Version runs again. */
export async function tentarDeNovo(): Promise<void> {
  const sessao = await sessaoDaAcao();
  await anotarAtrito(sessao.id, 'tentou_de_novo', { onde: 'resultado' });
  await garantirGeracao(sessao.id, { deNovo: true });
  redirect('/casa/curriculo');
}

// ---- o fim da sessão (passo 07) ----------------------------------------------

export interface EstadoFim {
  erro: string | null;
  /** How many times this form went through on this page (the screen thanks from the first). */
  enviados: number;
  /** What was typed, so an error does not cost the person the form (React resets it). */
  valores: Record<string, string[]>;
}

const valoresDo = (form: FormData): EstadoFim['valores'] => {
  const valores: EstadoFim['valores'] = {};
  for (const k of new Set(form.keys())) {
    if (!k.startsWith('$')) valores[k] = form.getAll(k).map(String); // `$…` are React's own fields
  }
  return valores;
};

/**
 * One form at the end: read it, write it, and stay on the page (no redirect,
 * so a long screen does not jump back to the top). Only once the résumé was
 * delivered; the first one sent closes the session (`encerrado`).
 */
async function enviarFim<T>(
  anterior: EstadoFim,
  form: FormData,
  ler: (form: FormData) => Lido<T>,
  gravar: (sessaoId: string, dados: T) => Promise<boolean>,
): Promise<EstadoFim> {
  const sessao = await sessaoDaAcao();
  const lido = ler(form);
  if (!lido.ok) return { ...anterior, erro: lido.erro, valores: valoresDo(form) };
  if (!(await gravar(sessao.id, lido.dados))) redirect('/casa/curriculo');
  return { erro: null, enviados: anterior.enviados + 1, valores: {} };
}

/** "Conhece outro dev…": names and contacts. Daniel makes their tokens with `--indicado-por`. */
export async function enviarIndicacoes(anterior: EstadoFim, form: FormData): Promise<EstadoFim> {
  return enviarFim(anterior, form, lerIndicacoes, registrarIndicacoes);
}

/** The testimonial (with its own consent) and "algo deu errado?". */
export async function enviarOpiniao(anterior: EstadoFim, form: FormData): Promise<EstadoFim> {
  return enviarFim(anterior, form, lerOpiniao, gravarOpiniao);
}

// ---- as vagas (passo 15) ------------------------------------------------------

/** The Vagas consent, asked at "Achei uma vaga": yes goes on to paste the posting, no goes back home. */
export async function responderVagas(form: FormData): Promise<void> {
  const sessao = await sessaoDaAcao();
  const resposta = form.get('resposta');
  if (resposta === 'sim' || resposta === 'nao') {
    await responderConsentimentoVagas(sessao.id, resposta === 'sim');
    if (resposta === 'sim') redirect('/casa/vagas/nova');
  }
  redirect('/casa');
}

export interface EstadoVaga {
  erro: string | null;
  /** What was typed, so an error does not cost the person their paste. */
  valores: Record<string, string>;
}

/**
 * "Ler a vaga": the Vaga is created (the limit and the consent are checked in
 * the same transaction) and its reading starts in the background; the Vaga's
 * page waits for it.
 */
export async function colarVaga(_anterior: EstadoVaga, form: FormData): Promise<EstadoVaga> {
  const sessao = await sessaoDaAcao();
  if (!(await vagasLiberadas(sessao.id))) redirect('/casa');
  const lido = lerVagaColada(form);
  if (!lido.ok) {
    const valores = Object.fromEntries(['texto', 'empresa', 'cargo', 'link'].map((k) => [k, String(form.get(k) ?? '')]));
    return { erro: lido.erro, valores };
  }
  const criacao = await criarVaga(sessao.id, lido.dados);
  // At the limit or without the consent, the page shows which.
  if (criacao.tipo !== 'criada') redirect('/casa/vagas/nova');
  await garantirLeitura(sessao.id, criacao.vaga.id);
  redirect(`/casa/vagas/${criacao.vaga.id}`);
}

/** "Tentar de novo" after the reading failed. */
export async function lerDeNovo(vagaId: string): Promise<void> {
  const sessao = await sessaoDaAcao();
  await anotarAtrito(sessao.id, 'tentou_de_novo', { onde: 'vaga' });
  await garantirLeitura(sessao.id, vagaId, { deNovo: true });
  redirect(`/casa/vagas/${vagaId}`);
}

/** Company and role confirmed, the gaps marked: saved, and the page shows them as they are now. */
export async function confirmarVaga(vagaId: string, _anterior: EstadoVaga, form: FormData): Promise<EstadoVaga> {
  const sessao = await sessaoDaAcao();
  const lido = lerConfirmacao(form);
  if (!lido.ok) return { erro: lido.erro, valores: { empresa: String(form.get('empresa') ?? ''), cargo: String(form.get('cargo') ?? '') } };
  await gravarConfirmacao(sessao.id, vagaId, lido.dados);
  redirect(`/casa/vagas/${vagaId}?salvo=1`);
}

/** "Apagar esta vaga", after the second confirmation. After a turn of its conversation in flight, so nothing of it is written after. */
export async function apagarVaga(vagaId: string): Promise<void> {
  const { id } = await sessaoDaAcao();
  await emSerie(id, () => esvaziarVaga(id, vagaId));
  redirect('/casa');
}

/**
 * "Gerar agora" and "Gerar de novo" on a confirmed Vaga (step 17): a new
 * Version of its résumé in the background, while it has generations left.
 * Another account's Vaga starts nothing (`criarGeracao` checks it).
 */
export async function gerarParaAVaga(vagaId: string): Promise<void> {
  const sessao = await sessaoDaAcao();
  await novaGeracao(sessao.id, vagaId);
  redirect(`/casa/vagas/${vagaId}`);
}

/** The header form on a Vaga, for someone with no résumé yet: saved, then the Vaga's first Version starts. */
export async function enviarCabecalhoDaVaga(vagaId: string, _anterior: EstadoCabecalho, form: FormData): Promise<EstadoCabecalho> {
  const sessao = await sessaoDaAcao();
  const lido = lerCabecalho(form);
  if (!lido.ok) {
    const valores = Object.fromEntries(['nome', 'email', 'linkedin', 'github', 'local'].map((k) => [k, String(form.get(k) ?? '')]));
    return { erro: lido.erro, valores };
  }
  if (await gravarCabecalho(sessao.id, lido.cabecalho)) await novaGeracao(sessao.id, vagaId);
  redirect(`/casa/vagas/${vagaId}`);
}

/** "Tentar de novo" after a Vaga's generation failed: the same Version runs again. */
export async function tentarDeNovoNaVaga(vagaId: string): Promise<void> {
  const sessao = await sessaoDaAcao();
  await anotarAtrito(sessao.id, 'tentou_de_novo', { onde: 'curriculo_da_vaga' });
  if (await vagaDaSessao(sessao.id, vagaId)) {
    await garantirGeracao(sessao.id, { deNovo: true, vagaId });
  }
  redirect(`/casa/vagas/${vagaId}`);
}

/**
 * "Responder às perguntas" on a confirmed Vaga (step 16): its conversation
 * opens on the first of its queue. Another account's Vaga goes back home.
 */
export async function conversarSobreAVaga(vagaId: string): Promise<void> {
  const { id } = await sessaoDaAcao();
  const vaga = await vagaDaSessao(id, vagaId);
  if (!vaga) redirect('/casa');
  if (vaga.estagio !== 'confirmada') redirect(`/casa/vagas/${vagaId}`);
  await emSerie(id, () => abrirConversaDaVaga(id, vagaId));
  redirect(`/casa/vagas/${vagaId}/conversa`);
}
