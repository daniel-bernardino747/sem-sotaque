// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * A link that opens a WhatsApp chat with whoever hosts the app, the message
 * already typed. The number comes from `CONTATO_WHATSAPP`, never the code;
 * without one, the same message goes by e-mail to the contact address of the
 * policy and the terms. Read on the server.
 */
export function linkDeContato(texto: string, env: Record<string, string | undefined> = process.env): string {
  const numero = (env.CONTATO_WHATSAPP ?? '').replace(/\D/g, '');
  if (numero) return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  return `mailto:hello@teamdbsolutions.com?subject=sem-sotaque&body=${encodeURIComponent(texto)}`;
}
