// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { emRetomada, estadoDoPlano, opcoesDaOferta } from '@/avaliador';
import { mensagensDaSessao, type Sessao } from '@/db';
import { progressoDaSessao } from '@/interrogatorio/turno';

import { terminar } from '../acoes';
import { Chat, type MensagemDoChat } from './chat';

/** After this long away, the link opens with the last question asked again. */
const AUSENCIA_MS = 5 * 60_000;

/**
 * The interrogation screen: the conversation so far, from the database, and
 * the chat that continues it. Opening it again lands at the last question; a
 * subject opened after it (a retomada, "contar algo novo") gets its first one.
 * With `vagaId`, a Vaga's conversation (step 16): only its messages, and its
 * end goes back to the Vaga.
 */
export async function Conversa({ sessao, vagaId = null }: { sessao: Sessao; vagaId?: string | null }) {
  const [mensagens, progresso, opcoes, plano] = await Promise.all([
    mensagensDaSessao(sessao.id, vagaId),
    progressoDaSessao(sessao.id),
    opcoesDaOferta(sessao.id, vagaId),
    estadoDoPlano(sessao.id, vagaId),
  ]);
  const daVaga = vagaId ? `/casa/vagas/${vagaId}` : null;
  const visiveis: MensagemDoChat[] = mensagens
    .filter((m) => m.papel !== 'sistema')
    .map((m) => ({ id: m.id, papel: m.papel === 'assistente' ? 'assistente' : 'pessoa', texto: m.conteudo }));

  const ultima = mensagens.at(-1);
  // A subject opened after the last message (a retomada, "contar algo novo") is owed its first question.
  const assuntoNovo = (plano?.assunto?.desde ?? -1) >= mensagens.length;
  const repetir =
    !assuntoNovo && ultima?.papel === 'assistente' && Date.now() - ultima.createdAt.getTime() > AUSENCIA_MS
      ? ultima.conteudo
      : null;

  return (
    <Chat
      endereco={daVaga ? `${daVaga}/chat` : `/casa/chat`}
      inicial={visiveis}
      progressoInicial={progresso}
      opcoesIniciais={opcoes}
      repetir={repetir}
      // No question yet, the last turn never got its question, or a new subject: ask for it.
      continuarAoAbrir={!ultima || ultima.papel !== 'assistente' || assuntoNovo}
      terminar={terminar}
      retomada={emRetomada(sessao.estado) || Boolean(daVaga)}
      casa={daVaga ?? '/casa'}
      rotuloVolta={daVaga ? 'Voltar para a vaga' : undefined}
      curriculo={`/casa/curriculo`}
    />
  );
}
