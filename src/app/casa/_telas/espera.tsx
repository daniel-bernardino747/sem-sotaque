// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import type { EtapaDaGeracao } from '@/geracao/pipeline';

const INTERVALO_MS = 3000;

const FRASES: Record<EtapaDaGeracao, string> = {
  selecao: 'Escolhendo o que entra na página e escrevendo em inglês…',
  conferindo: 'Conferindo cada número com o que você me contou…',
  render: 'Montando o PDF…',
  critico: 'Relendo como um recrutador de fora, que não conhece nada da sua história…',
  reescrita: 'Reescrevendo as linhas que não passaram…',
  mapa: 'Ligando cada pedido da vaga à linha do currículo que responde a ele…',
};

/** The waiting screen: says what the background run is doing and reloads the page until it is done. */
export function Espera({ etapa }: { etapa: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVALO_MS);
    return () => clearInterval(id);
  }, [router]);

  return (
    <>
      <h1>Escrevendo seu currículo</h1>
      <p className="etapa" aria-live="polite">
        <span className="pontos" aria-hidden="true" />
        {FRASES[(etapa ?? 'selecao') as EtapaDaGeracao] ?? FRASES.selecao}
      </p>
      <p className="aviso">
        Leva um ou dois minutos. Pode deixar esta página aberta; se fechar, é só entrar de novo.
      </p>
    </>
  );
}
