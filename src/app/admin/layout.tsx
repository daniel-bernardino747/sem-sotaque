// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ReactNode } from 'react';

import './painel.css';

export const metadata = { title: 'Painel · sem-sotaque', robots: { index: false, follow: false } };

/** Daniel's panel. The lock is in each page and action (`exigirAdmin`), not here. */
export default function LayoutDoPainel({ children }: { children: ReactNode }) {
  return <div className="painel">{children}</div>;
}
