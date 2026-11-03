// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import type { EstadoFim } from '../acoes';
import { BotaoEnviar } from './botao-enviar';

type Acao = (anterior: EstadoFim, form: FormData) => Promise<EstadoFim>;

const INICIAL: EstadoFim = { erro: null, enviados: 0, valores: {} };
const valor = (estado: EstadoFim, nome: string, i = 0) => estado.valores[nome]?.[i] ?? '';

function Erro({ estado }: { estado: EstadoFim }) {
  return estado.erro ? (
    <p role="alert" className="erro">
      {estado.erro}
    </p>
  ) : null;
}

/** "Conhece outro dev…": one row to start, more on demand. */
export function FormularioIndicacao({ enviar, jaIndicou }: { enviar: Acao; jaIndicou: number }) {
  const [estado, acao] = useActionState(enviar, INICIAL);
  const [linhas, setLinhas] = useState(1);
  const total = Math.max(linhas, estado.valores.nome?.length ?? 0);
  const indicou = jaIndicou > 0 || estado.enviados > 0;
  return (
    <>
      {indicou && (
        <p className="recebido" role="status">
          Anotado, obrigado! Se lembrar de mais alguém, é só mandar de novo.
        </p>
      )}
      <form action={acao} className="envio">
        {Array.from({ length: total }, (_, i) => (
          <fieldset key={i} className="indicacao">
            <legend className="visualmente-oculto">Pessoa {i + 1}</legend>
            <label className="campo">
              <span>Nome</span>
              <input name="nome" type="text" autoComplete="off" defaultValue={valor(estado, 'nome', i)} />
            </label>
            <label className="campo">
              <span>WhatsApp ou LinkedIn</span>
              <input name="contato" type="text" autoComplete="off" defaultValue={valor(estado, 'contato', i)} />
            </label>
          </fieldset>
        ))}
        <button type="button" className="discreto" onClick={() => setLinhas(total + 1)}>
          + mais uma pessoa
        </button>
        <Erro estado={estado} />
        <BotaoEnviar pendente="Guardando…" className="primario">
          Indicar
        </BotaoEnviar>
      </form>
    </>
  );
}

/**
 * The testimonial and the comment. The testimonial's checkbox is its own
 * consent: unticked, never required, and not the entry one (`aceito`).
 */
export function FormularioOpiniao({ enviar, jaEnviou }: { enviar: Acao; jaEnviou: boolean }) {
  const [estado, acao] = useActionState(enviar, INICIAL);
  if (jaEnviou || estado.enviados > 0) {
    return (
      <p className="recebido" role="status">
        Recebido. Obrigado!
      </p>
    );
  }
  return (
    <form action={acao} className="envio">
      <label className="campo">
        <span>O que achou? (opcional)</span>
        <textarea name="depoimento" rows={4} defaultValue={valor(estado, 'depoimento')} />
      </label>
      <label className="caixa">
        <input
          type="checkbox"
          name="depoimento_pode_usar"
          value="sim"
          defaultChecked={valor(estado, 'depoimento_pode_usar') === 'sim'}
        />
        <span>
          Pode usar meu depoimento com meu nome para divulgar.{' '}
          <small>Sem marcar, o que você escreveu fica só comigo.</small>
        </span>
      </label>
      <label className="campo">
        <span>Algo deu errado ou ficou estranho? (opcional)</span>
        <textarea name="comentario" rows={3} defaultValue={valor(estado, 'comentario')} />
      </label>
      <Erro estado={estado} />
      <BotaoEnviar pendente="Enviando…" className="primario">
        Enviar
      </BotaoEnviar>
    </form>
  );
}

/**
 * Leaving the section without sending closes the session too: once the
 * section has been on screen, the page going away (tab closed, app switched)
 * sends a beacon. Renders nothing.
 */
export function SaidaDaSecao({ alvo, url }: { alvo: string; url: string }) {
  const visto = useRef(false);
  useEffect(() => {
    const secao = document.getElementById(alvo);
    if (!secao) return;
    let enviado = false;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) visto.current = true;
    });
    observador.observe(secao);
    const sair = () => {
      if (!visto.current || enviado) return;
      enviado = navigator.sendBeacon(url);
    };
    const aoMudar = () => {
      if (document.visibilityState === 'hidden') sair();
    };
    document.addEventListener('visibilitychange', aoMudar);
    window.addEventListener('pagehide', sair);
    return () => {
      observador.disconnect();
      document.removeEventListener('visibilitychange', aoMudar);
      window.removeEventListener('pagehide', sair);
    };
  }, [alvo, url]);
  return null;
}
