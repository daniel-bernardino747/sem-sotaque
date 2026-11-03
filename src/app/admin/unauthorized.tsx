// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { entrar } from './acoes';
import { FormularioEntrada } from './_formularios';

/** What `/admin` answers without the cookie, with status 401: the token form. */
export default function SemAcesso() {
  return (
    <main>
      <h1>Painel</h1>
      <p>Digite o ADMIN_TOKEN para entrar. O navegador guarda um cookie por 30 dias.</p>
      <FormularioEntrada entrar={entrar} />
    </main>
  );
}
