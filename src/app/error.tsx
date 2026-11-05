// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useEffect } from 'react';

import { enviarRelato, relatoDoNavegador } from '@/erros/relato';

import { Faixa } from './marca';
import { Cantoneiras } from './ornamentos';

/**
 * A screen that broke (step 26). The report carries Next's digest, the same
 * the server's error was recorded with, so the panel ties the two.
 */
export default function DeuErrado({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    enviarRelato(relatoDoNavegador('limite', error, window.location.pathname));
  }, [error]);
  return (
    <>
      <Faixa />
      <main className="nao-encontrada placa">
        <Cantoneiras />
        <h1>Algo deu errado nesta tela</h1>
        <p>O que você já tinha enviado está guardado. Tente abrir de novo; se continuar, volte daqui a pouco.</p>
        <p>
          <button type="button" onClick={reset}>
            Abrir de novo
          </button>{' '}
          <a href="/casa">Voltar para a minha página</a>
        </p>
      </main>
    </>
  );
}
