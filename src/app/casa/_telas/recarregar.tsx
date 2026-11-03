// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Reloads the page every few seconds while something runs in the background (the reading of a Vaga). */
export function Recarregar({ intervaloMs = 3000 }: { intervaloMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervaloMs);
    return () => clearInterval(id);
  }, [router, intervaloMs]);
  return null;
}
