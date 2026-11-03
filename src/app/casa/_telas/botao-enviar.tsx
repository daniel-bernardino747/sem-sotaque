// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/** A submit button that says it is working, so a slow phone connection does not get a second tap. */
export function BotaoEnviar({
  children,
  pendente,
  className,
}: {
  children: ReactNode;
  pendente: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendente : children}
    </button>
  );
}
