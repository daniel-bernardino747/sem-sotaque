// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { VagaComRequisitos } from '@/db';

import { apagarVaga, confirmarVaga, conversarSobreAVaga, lerDeNovo } from '../acoes';
import { ApagarVaga } from './apagar-vaga';
import { BotaoEnviar } from './botao-enviar';
import { ConfirmarVaga } from './confirmar-vaga';
import { CurriculoDaVaga } from './curriculo-da-vaga';
import { VoltarParaACasa } from './moldura';
import { Recarregar } from './recarregar';

/**
 * A Vaga (`/vagas/<id>`), by its stage: the reading running (the page reloads
 * until it is done), the reading failed, or read: the company and the role to
 * confirm, the language warning and the checklist of gaps. Once confirmed, how
 * many questions its conversation still has (step 16) and its résumé (step
 * 17). "Apagar esta vaga" is there in every stage.
 */
export function Vaga({
  sessaoId,
  vaga,
  salvo,
  emAberto,
}: {
  sessaoId: string;
  vaga: VagaComRequisitos;
  salvo: boolean;
  /** The questions of its conversation still open; null before the Vaga is confirmed. */
  emAberto: number | null;
}) {
  return (
    <>
      <VoltarParaACasa />
      <Estagio sessaoId={sessaoId} vaga={vaga} salvo={salvo} emAberto={emAberto} />
      <div className="apagar-vaga">
        <ApagarVaga apagar={apagarVaga.bind(null, vaga.id)} />
      </div>
    </>
  );
}

const perguntas = (n: number) => (n === 0 ? 'Nenhuma pergunta em aberto' : n === 1 ? '1 pergunta em aberto' : `${n} perguntas em aberto`);

function Estagio({
  sessaoId,
  vaga,
  salvo,
  emAberto,
}: {
  sessaoId: string;
  vaga: VagaComRequisitos;
  salvo: boolean;
  emAberto: number | null;
}) {
  if (vaga.estagio === 'lendo') {
    return (
      <>
        <Recarregar />
        <h1>Lendo a vaga</h1>
        <p className="etapa" aria-live="polite">
          <span className="pontos" aria-hidden="true" />
          Separando o que a vaga pede e o que você já me contou que cobre cada coisa…
        </p>
        <p className="aviso">
          Leva menos de um minuto. Pode deixar esta página aberta; se fechar, a vaga fica na sua página.
        </p>
      </>
    );
  }

  if (vaga.estagio === 'leitura_falhou') {
    return (
      <>
        <h1>Não consegui ler a vaga</h1>
        <p>Deu um erro do meu lado, não no que você colou.</p>
        <form action={lerDeNovo.bind(null, vaga.id)} className="seguir">
          <BotaoEnviar pendente="Começando…">Tentar de novo</BotaoEnviar>
        </form>
      </>
    );
  }

  const cobertos = vaga.requisitos.filter((r) => !r.lacuna);
  const lacunas = vaga.requisitos.filter((r) => r.lacuna);
  return (
    <>
      <h1>{vaga.cargo ?? 'A vaga'}</h1>
      {vaga.empresa && <p className="subtitulo">{vaga.empresa}</p>}

      {vaga.lingua === 'pt' && (
        <p className="mudou">
          Esta vaga é em português, mas o currículo que eu faço é sempre em inglês. Se a empresa pedir currículo em
          português, este não serve para ela.
        </p>
      )}

      <p>
        {vaga.requisitos.length === 0
          ? 'Não achei requisitos no texto da vaga.'
          : cobertos.length === vaga.requisitos.length
            ? `A vaga pede ${vaga.requisitos.length} coisas, e tudo já está no que você me contou.`
            : `A vaga pede ${vaga.requisitos.length} coisas. ${cobertos.length} já estão no que você me contou.`}
      </p>
      {cobertos.length > 0 && (
        <details className="cobertos">
          <summary>O que já está coberto</summary>
          <ul>
            {cobertos.map((r) => (
              <li key={r.id}>{r.texto}</li>
            ))}
          </ul>
        </details>
      )}

      {emAberto !== null && (
        <div className="acao conversa-da-vaga">
          {emAberto > 0 && (
            <form action={conversarSobreAVaga.bind(null, vaga.id)}>
              <BotaoEnviar pendente="Abrindo…" className="primario">
                Responder às perguntas
              </BotaoEnviar>
            </form>
          )}
          <p className="em-aberto">{perguntas(emAberto)}</p>
          {emAberto > 0 && (
            <p className="dica">O que você me contar aqui entra no seu currículo geral e nas próximas vagas também.</p>
          )}
        </div>
      )}

      {emAberto !== null && <CurriculoDaVaga sessaoId={sessaoId} vaga={vaga} principal={emAberto === 0} />}

      {salvo && <p className="recebido">Salvo.</p>}
      <ConfirmarVaga
        confirmar={confirmarVaga.bind(null, vaga.id)}
        empresa={vaga.empresa}
        cargo={vaga.cargo}
        lacunas={lacunas.map((l) => ({ id: l.id, texto: l.texto, obrigatorio: l.tipo === 'obrigatorio', resposta: l.resposta }))}
      />
    </>
  );
}
