// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from 'vitest';

import { urlDeRetorno } from './oauth';

afterEach(() => vi.unstubAllEnvs());

describe('urlDeRetorno', () => {
  it('uses APP_URL, without the trailing slash', () => {
    vi.stubEnv('APP_URL', 'https://semsotaque.teamdbsolutions.com/');
    expect(urlDeRetorno('google', 'http://10.0.0.5:3000')).toBe('https://semsotaque.teamdbsolutions.com/api/auth/callback/google');
  });

  it('in dev without APP_URL, the origin the request came on', () => {
    vi.stubEnv('APP_URL', '');
    expect(urlDeRetorno('github', 'http://localhost:3000')).toBe('http://localhost:3000/api/auth/callback/github');
  });

  it('in production without APP_URL, refuses: behind the proxy the origin is not the public one', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => urlDeRetorno('github', 'http://10.0.0.5:3000')).toThrow(/APP_URL/);
  });
});
