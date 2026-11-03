// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Viewport } from 'next';
import { Azeret_Mono, Libre_Caslon_Display } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

// The one web font: field labels, numbers and stamps. Reading text stays in the phone's own face.
const mono = Azeret_Mono({
  weight: ['400', '600'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--mono-carregada',
});

// The banknote's display face, for titles only: the wordmark, `h1` and `h2`.
const serifa = Libre_Caslon_Display({
  weight: '400',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--serifa',
});

export const metadata = {
  title: 'sem-sotaque',
};

export const viewport: Viewport = {
  // The banknote is cobalt in both themes, so the browser bar is too.
  themeColor: '#1c3d8f',
  colorScheme: 'dark',
  // Android shrinks the layout when the keyboard opens, so the chat's composer stays above it.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${mono.variable} ${serifa.variable}`}>
      <body>{children}</body>
    </html>
  );
}
