// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { linkDeContato } from './contato';

describe('linkDeContato', () => {
  it('opens a chat with the number in CONTATO_WHATSAPP, the message already typed', () => {
    expect(linkDeContato('Oi, tudo bem?', { CONTATO_WHATSAPP: '5511999990000' })).toBe('https://wa.me/5511999990000?text=Oi%2C%20tudo%20bem%3F');
  });

  it('keeps only the digits of the number', () => {
    expect(linkDeContato('Oi', { CONTATO_WHATSAPP: '+55 (11) 99999-0000' })).toBe('https://wa.me/5511999990000?text=Oi');
  });

  it('falls back to an e-mail to the contact address when no number is set', () => {
    for (const env of [{}, { CONTATO_WHATSAPP: '' }, { CONTATO_WHATSAPP: ' - ' }]) {
      expect(linkDeContato('Oi, tudo bem?', env)).toBe('mailto:hello@teamdbsolutions.com?subject=sem-sotaque&body=Oi%2C%20tudo%20bem%3F');
    }
  });
});
