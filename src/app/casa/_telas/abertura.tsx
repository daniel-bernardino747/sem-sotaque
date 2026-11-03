// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useEffect } from 'react';

/** Records `link_aberto` once the page is running in a browser; renders nothing. */
export function Abertura({ registrar }: { registrar: () => Promise<void> }) {
  useEffect(() => {
    registrar().catch(() => {});
  }, [registrar]);
  return null;
}
