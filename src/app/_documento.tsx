// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Faixa } from '@/app/marca';
import type { Trecho } from '@/conteudo/consentimento';
import { documento, type NomeDoDocumento } from '@/conteudo/documento';

/** A paragraph's runs, the bold ones in `<strong>`. */
function Trechos({ trechos }: { trechos: Trecho[] }) {
  return trechos.map((t, i) => (t.negrito ? <strong key={i}>{t.texto}</strong> : t.texto));
}

/** `/termos` and `/privacidade` (step 22): the band and the text, public, one column. */
export function Documento({ nome }: { nome: NomeDoDocumento }) {
  return (
    <>
      <Faixa />
      <main className="documento">
        {documento(nome).map((b, i) => {
          if (b.tipo === 'titulo') return <h1 key={i}>{b.texto}</h1>;
          if (b.tipo === 'secao') return <h2 key={i}>{b.texto}</h2>;
          if (b.tipo === 'lista') {
            return (
              <ul key={i}>
                {b.itens.map((item, j) => (
                  <li key={j}>
                    <Trechos trechos={item} />
                  </li>
                ))}
              </ul>
            );
          }
          return (
            <p key={i}>
              <Trechos trechos={b.trechos} />
            </p>
          );
        })}
      </main>
      <footer>
        <LinksLegais />
      </footer>
    </>
  );
}

/**
 * The code this app runs, as the AGPL asks a network service to offer (section
 * 13). A modified copy that is hosted for others points this at its own source.
 */
export const CODIGO_FONTE = 'https://github.com/daniel-bernardino747/sem-sotaque';

/** The links every footer carries (steps 22 and 24). */
export function LinksLegais() {
  return (
    <p className="links-legais">
      <a href="/termos">Termos de uso</a> · <a href="/privacidade">Política de privacidade</a> · <a href={CODIGO_FONTE}>Código-fonte</a>
    </p>
  );
}
