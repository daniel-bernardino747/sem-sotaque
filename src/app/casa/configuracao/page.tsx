// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { configuracaoDaInstancia } from '@/db';
import { statusDosCaminhos } from '@/llm/disponibilidade';
import { modo } from '@/modo';

import { salvarConfiguracao } from '../acoes';
import { FormConfiguracao, type OpcaoDeCaminho } from '../_telas/form-configuracao';
import { Moldura, VoltarParaACasa } from '../_telas/moldura';

export const metadata = { robots: { index: false, follow: false } };

/**
 * The configuration of `MODO=local` (step 28, M3): how the app reaches the
 * model. Hosted it does not exist: there the way is always the API, on the
 * sem-sotaque account. Each way is checked on this machine as the page opens.
 */
export default async function PaginaDeConfiguracao() {
  // Per request, before reading the mode: one image serves hosted and MODO=local, and its build has no MODO,
  // so a check made at build time would freeze a 404 the self-host would serve too. The CLIs run now, too.
  await connection();
  if (modo() !== 'local') notFound();
  const [status, configuracao] = await Promise.all([statusDosCaminhos(), configuracaoDaInstancia()]);

  const opcoes: OpcaoDeCaminho[] = [
    {
      caminho: 'api',
      titulo: 'Chave da API da Anthropic',
      descricao: 'A ANTHROPIC_API_KEY do seu .env. Cada pergunta é cobrada na sua conta da API.',
      estado: status.api,
    },
    {
      caminho: 'assinatura_claude',
      titulo: 'Assinatura do Claude',
      descricao: 'O claude -p logado nesta máquina. Gasta o limite do seu plano, não a API.',
      estado: status.assinatura_claude,
    },
    {
      caminho: 'assinatura_chatgpt',
      titulo: 'Assinatura do ChatGPT',
      descricao: 'O codex exec logado nesta máquina, sem poder rodar nada. Os textos foram afinados para o Claude.',
      estado: status.assinatura_chatgpt,
      experimental: true,
    },
  ];

  return (
    <Moldura>
      <VoltarParaACasa />
      <h1>Configuração</h1>
      <p>
        Escolha por onde o sem-sotaque fala com o modelo. Pelas assinaturas, o uso é seu, sob os termos da Anthropic ou da
        OpenAI: o README explica.
      </p>
      <FormConfiguracao
        salvar={salvarConfiguracao}
        opcoes={opcoes}
        atual={configuracao.caminho}
        modeloCodex={configuracao.modeloCodex}
      />
    </Moldura>
  );
}
