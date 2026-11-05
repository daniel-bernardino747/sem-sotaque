// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useEffect } from 'react';

import { enviarRelato, relatoDoNavegador } from '@/erros/relato';

/**
 * Listens, on every screen of `/casa`, for what breaks in the browser outside
 * React (step 26): an uncaught error and a rejected promise nobody handled.
 * Each goes to `/api/erros` by its shape only. Draws nothing.
 */
export function OuvidoDeErros() {
  useEffect(() => {
    const aoErro = (e: ErrorEvent) => enviarRelato(relatoDoNavegador('janela', e.error, window.location.pathname));
    const aoRejeitar = (e: PromiseRejectionEvent) => enviarRelato(relatoDoNavegador('promessa', e.reason, window.location.pathname));
    window.addEventListener('error', aoErro);
    window.addEventListener('unhandledrejection', aoRejeitar);
    return () => {
      window.removeEventListener('error', aoErro);
      window.removeEventListener('unhandledrejection', aoRejeitar);
    };
  }, []);
  return null;
}
