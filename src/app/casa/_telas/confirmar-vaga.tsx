// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useActionState } from 'react';

import type { EstadoVaga } from '../acoes';
import { BotaoEnviar } from './botao-enviar';

export interface LacunaDoChecklist {
  id: string;
  texto: string;
  obrigatorio: boolean;
  resposta: 'ja_usei' | 'nao_usei' | null;
}

/**
 * The company and the role to confirm, and the checklist of gaps (P8, P9).
 * `confirmar` is `confirmarVaga` bound to the Vaga.
 */
export function ConfirmarVaga({
  confirmar,
  empresa,
  cargo,
  lacunas,
}: {
  confirmar: (anterior: EstadoVaga, form: FormData) => Promise<EstadoVaga>;
  empresa: string | null;
  cargo: string | null;
  lacunas: LacunaDoChecklist[];
}) {
  const [estado, acao] = useActionState(confirmar, { erro: null, valores: {} });

  return (
    <form action={acao} className="envio confirmar-vaga">
      <fieldset>
        <legend>Confira a empresa e o cargo</legend>
        <label className="campo">
          <span>Empresa</span>
          <input name="empresa" autoComplete="off" defaultValue={estado.valores.empresa ?? empresa ?? ''} />
        </label>
        <label className="campo">
          <span>Cargo</span>
          <input name="cargo" autoComplete="off" defaultValue={estado.valores.cargo ?? cargo ?? ''} />
        </label>
        <p className="dica">Mudar o cargo não muda os requisitos: eles vêm do texto da vaga.</p>
      </fieldset>

      {lacunas.length > 0 && (
        <fieldset className="lacunas">
          <legend>O que a vaga pede e você ainda não me contou</legend>
          <p className="dica">
            Marque o que você já usou, mesmo que pouco: eu pergunto sobre isso antes de fazer o currículo. O que ficar sem
            marcar conta como “não usei”.
          </p>
          <ul>
            {lacunas.map((l) => (
              <li key={l.id} className="lacuna">
                <p>
                  {l.texto} <span className="tipo">{l.obrigatorio ? 'Obrigatório' : 'Desejável'}</span>
                </p>
                <div className="opcoes" role="radiogroup" aria-label={l.texto}>
                  <label className="opcao">
                    <input type="radio" name={`lacuna-${l.id}`} value="ja_usei" defaultChecked={l.resposta === 'ja_usei'} />
                    Já usei
                  </label>
                  <label className="opcao">
                    <input type="radio" name={`lacuna-${l.id}`} value="nao_usei" defaultChecked={l.resposta === 'nao_usei'} />
                    Não usei
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {estado.erro && (
        <p role="alert" className="erro">
          {estado.erro}
        </p>
      )}
      <BotaoEnviar pendente="Salvando…">Salvar</BotaoEnviar>
    </form>
  );
}
