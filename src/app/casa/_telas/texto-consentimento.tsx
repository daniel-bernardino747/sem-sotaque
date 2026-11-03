// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { textoDoConsentimento, type Trecho } from '@/conteudo/consentimento';

/**
 * The consent text set as a passport's data page: each paragraph that opens
 * with a bold label ("Quem lê:") becomes a field, label above the value; the
 * others stay plain paragraphs. The words are the file's, unchanged.
 */
export function TextoDoConsentimento({ versao }: { versao?: string }) {
  const paragrafos = textoDoConsentimento(versao);
  const ehCampo = (p: Trecho[]) => p.length > 1 && p[0].negrito;
  const soltos = paragrafos.filter((p) => !ehCampo(p));
  const campos = paragrafos.filter(ehCampo);

  return (
    <>
      {soltos.map((p, i) => (
        <p key={i} className="dados-intro">
          <Trechos trechos={p} />
        </p>
      ))}
      <dl className="pagina-de-dados">
        {campos.map((p, i) => (
          <div key={i}>
            <dt className="rotulo">{p[0].texto.replace(/:\s*$/, '')}</dt>
            <dd>
              <Trechos trechos={[{ ...p[1], texto: p[1].texto.trimStart() }, ...p.slice(2)]} />
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function Trechos({ trechos }: { trechos: Trecho[] }) {
  return trechos.map((t, j) => (t.negrito ? <strong key={j}>{t.texto}</strong> : t.texto));
}
