// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useEffect } from 'react';

import { enviarRelato, relatoDoNavegador } from '@/erros/relato';

import './globals.css';

/**
 * When the root layout itself broke (step 26): it replaces the whole
 * document, so it brings its own `<html>` and none of the layout's pieces.
 */
export default function DeuErradoNoTodo({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    enviarRelato(relatoDoNavegador('limite', error, window.location.pathname));
  }, [error]);
  return (
    <html lang="pt-BR">
      <body>
        <main className="nao-encontrada placa">
          <h1>Algo deu errado</h1>
          <p>O que você já tinha enviado está guardado. Recarregue a página daqui a pouco.</p>
          <p>
            <a href="/casa">Voltar para a minha página</a>
          </p>
        </main>
      </body>
    </html>
  );
}
