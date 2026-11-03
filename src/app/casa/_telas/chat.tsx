// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { OpcaoOferta } from '@/avaliador';
import type { Progresso } from '@/interrogatorio/estado';
import type { Entrada } from '@/interrogatorio/turno';

import type { EventoChat } from '../_chat';
import { BotaoEnviar } from './botao-enviar';
import { Vistos } from './vistos';

export interface MensagemDoChat {
  id: string;
  papel: 'assistente' | 'pessoa';
  texto: string;
}

/**
 * The interrogation chat, mobile first: one question at a time, streamed as
 * the model writes it, with how much of the résumé is covered, "pular esta"
 * and "terminei". Under the offer to stop, what is still pending: going back
 * to one of them, or stopping here. In a retomada (step 14) nothing ends the
 * interrogation: stopping goes back home.
 */
export function Chat({
  endereco,
  inicial,
  progressoInicial,
  opcoesIniciais,
  repetir,
  continuarAoAbrir,
  terminar,
  retomada,
  casa,
  curriculo,
  rotuloVolta = 'Voltar para a minha página',
}: {
  endereco: string;
  inicial: MensagemDoChat[];
  progressoInicial: Progresso;
  /** Under the offer to stop: the pending subjects. */
  opcoesIniciais: OpcaoOferta[];
  /** The last question, asked again after the person was away. */
  repetir: string | null;
  continuarAoAbrir: boolean;
  terminar: () => Promise<void>;
  /** The interrogation already ended: the person came back from the home. */
  retomada: boolean;
  /** The home (or the Vaga, in a Vaga's conversation) and the résumé page, where an end leads. */
  casa: string;
  curriculo: string;
  /** What the way back to `casa` says. */
  rotuloVolta?: string;
}) {
  const [mensagens, setMensagens] = useState(inicial);
  const [escrevendo, setEscrevendo] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [progresso, setProgresso] = useState(progressoInicial);
  const [opcoes, setOpcoes] = useState(opcoesIniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [encerrado, setEncerrado] = useState(false);
  const [confirmandoFim, setConfirmandoFim] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const comecou = useRef(false);

  const ocupado = escrevendo !== null;
  const abertos = progresso.total - progresso.fechadas;
  const temPergunta = mensagens.some((m) => m.papel === 'assistente');
  const repetindo = Boolean(repetir) && !ocupado && mensagens.at(-1)?.texto === repetir;
  // The question waiting for an answer is set large; everything before it recedes.
  const atual = !ocupado && !repetindo && mensagens.at(-1)?.papel === 'assistente' ? mensagens.length - 1 : -1;

  async function enviar(entrada: Entrada) {
    setErro(null);
    setOpcoes([]);
    const fala = entrada.tipo === 'resposta' ? entrada.texto : entrada.tipo === 'escolher' ? opcoes.find((o) => o.id === entrada.id)?.rotulo : null;
    if (fala) setMensagens((ms) => [...ms, { id: `local-${Date.now()}`, papel: 'pessoa', texto: fala }]);
    setEscrevendo('');
    let texto = '';
    try {
      const resposta = await fetch(endereco, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entrada),
      });
      if (resposta.status === 409) {
        // The session moved on (ended in another tab) or a turn is running:
        // reload the page, so the screen shows what was saved and nothing else.
        window.location.reload();
        return;
      }
      if (!resposta.ok || !resposta.body) throw new Error(String(resposta.status));

      const leitor = resposta.body.pipeThrough(new TextDecoderStream()).getReader();
      let resto = '';
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += value;
        const linhas = resto.split('\n');
        resto = linhas.pop() ?? '';
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const evento = JSON.parse(linha) as EventoChat;
          if (evento.t === 'texto') {
            texto += evento.d;
            setEscrevendo(texto);
          } else if (evento.t === 'reiniciar') {
            texto = '';
            setEscrevendo('');
          } else if (evento.t === 'fim') {
            setProgresso(evento.progresso);
            setEncerrado(evento.encerrado);
            setOpcoes(evento.opcoes);
          } else {
            throw new Error(evento.mensagem);
          }
        }
      }
    } catch {
      setErro('Não consegui continuar agora.');
    } finally {
      // What streamed stays on screen, even when the turn failed after it.
      if (texto.trim()) {
        setMensagens((ms) => [...ms, { id: `local-${Date.now()}-a`, papel: 'assistente', texto: texto.trim() }]);
      }
      setEscrevendo(null);
    }
  }

  useEffect(() => {
    if (continuarAoAbrir && !comecou.current) {
      comecou.current = true;
      void enviar({ tipo: 'continuar' });
    }
    // Only on the first render: the page decides whether a question is owed.
  }, []);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens, escrevendo, erro]);

  function responder(e?: FormEvent) {
    e?.preventDefault();
    const texto = rascunho.trim();
    if (!texto || ocupado) return;
    setRascunho('');
    void enviar({ tipo: 'resposta', texto });
  }

  return (
    <div className="chat">
      <div className="progresso" role="status">
        <span className="rotulo">
          Currículo <strong>{progresso.cobertura}%</strong> coberto
        </span>
        <Vistos cobertura={progresso.cobertura} />
      </div>

      <ol className="mensagens" aria-live="polite">
        {mensagens.map((m, i) => (
          <li key={m.id} className={i === atual ? `${m.papel} atual` : m.papel}>
            {m.texto}
          </li>
        ))}
        {repetindo && (
          <>
            <li className="divisor">Continuando de onde paramos</li>
            <li className="assistente atual">{repetir}</li>
          </>
        )}
        {escrevendo !== null && (
          <li className="assistente atual escrevendo">{escrevendo || <span className="pontos">…</span>}</li>
        )}
      </ol>

      {opcoes.length > 0 && !ocupado && !encerrado && (
        <div className="oferta">
          {retomada ? (
            <a href={casa} className="botao primario">
              Parar e voltar para a minha página
            </a>
          ) : (
            <form action={terminar}>
              <BotaoEnviar pendente="Terminando…" className="primario">
                Parar e gerar meu currículo
              </BotaoEnviar>
            </form>
          )}
          <p>Ou volte a um destes, que ficaram pendentes:</p>
          <ul>
            {opcoes.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => void enviar({ tipo: 'escolher', id: o.id })}>
                  {o.rotulo}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {erro && (
        <div role="alert" className="erro">
          <p>{erro}</p>
          <button type="button" onClick={() => void enviar({ tipo: 'continuar' })}>
            Tentar de novo
          </button>
        </div>
      )}

      {encerrado ? (
        <div className="seguir">
          <a href={retomada ? casa : curriculo} className="botao primario">
            {retomada ? rotuloVolta : 'Ver meu currículo'}
          </a>
        </div>
      ) : (
        <form className="resposta" onSubmit={responder}>
          <textarea
            name="resposta"
            rows={2}
            value={rascunho}
            placeholder="Sua resposta"
            aria-label="Sua resposta"
            onChange={(e) => setRascunho(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) responder();
            }}
          />
          <button type="submit" className="enviar" disabled={ocupado || !rascunho.trim()}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="visualmente-oculto">Enviar</span>
          </button>
          <div className="atalhos">
            <button type="button" disabled={ocupado || !temPergunta} onClick={() => void enviar({ tipo: 'pular' })}>
              Pular esta
            </button>
            {retomada ? (
              <a href={casa} className="terminei">
                {rotuloVolta}
              </a>
            ) : (
              <button type="button" className="terminei" disabled={ocupado} onClick={() => setConfirmandoFim(true)}>
                Terminei
              </button>
            )}
          </div>
        </form>
      )}

      {confirmandoFim && !encerrado && (
        <form action={terminar} className="confirmar-fim" role="alertdialog" aria-labelledby="fim-titulo">
          <p id="fim-titulo">
            {abertos > 0 ? (
              <>
                <strong>
                  {abertos === 1 ? 'Ficou 1 coisa aberta.' : `Ficaram ${abertos} coisas abertas.`}
                </strong>{' '}
                O que ficou aberto não entra no currículo com número. Dá para terminar mesmo assim.
              </>
            ) : (
              <strong>Tudo fechado. Gerar o currículo?</strong>
            )}
          </p>
          <div className="botoes">
            <BotaoEnviar pendente="Terminando…">{abertos > 0 ? 'Terminar mesmo assim' : 'Terminar'}</BotaoEnviar>
            <button type="button" onClick={() => setConfirmandoFim(false)}>
              Continuar respondendo
            </button>
          </div>
        </form>
      )}
      <div ref={fim} />
    </div>
  );
}
