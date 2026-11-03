// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/** The headline of the import result screen. */
export function fraseDoImport(affiliations: number, accomplishments: number): string {
  if (affiliations === 0 && accomplishments === 0) {
    return 'Não encontrei experiências no que você enviou. As perguntas vão começar do zero.';
  }
  const experiencias = `${affiliations} ${affiliations === 1 ? 'experiência' : 'experiências'}`;
  const coisas = `${accomplishments} ${accomplishments === 1 ? 'coisa' : 'coisas'}`;
  return `Encontrei ${experiencias} e ${coisas} que você fez.`;
}
