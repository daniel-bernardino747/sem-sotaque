// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Metadata } from 'next';

import { Documento } from '../_documento';

export const metadata: Metadata = { title: 'Política de privacidade · sem-sotaque' };

export default function Privacidade() {
  return <Documento nome="privacidade" />;
}
