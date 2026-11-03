// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { NextConfig } from 'next';

// The image runs `next start` from the full build, not a standalone server: the
// same image also runs `npm run render:fixture` (tsx), which needs node_modules.
const nextConfig: NextConfig = {
  // A v0 link (`/s/<token>`) still leads to its Tester until it is linked, and
  // the OAuth callback carries a one-time code: keep both out of the request
  // log `next dev` prints.
  logging: { incomingRequests: { ignore: [/^\/s\//, /^\/api\/auth\//] } },
  experimental: {
    // `unauthorized()` (401 with the token form) for Daniel's panel, `/admin`.
    authInterrupts: true,
    // The import form posts a PDF of up to 5 MB (checked again in src/import);
    // the default limit for a Server Action body is 1 MB.
    serverActions: { bodySizeLimit: '6mb' },
  },
  async headers() {
    // No page a person opens signed in (or on the way in) hands its URL to
    // another site, nor lets a search engine or a shared cache keep it.
    const privada = [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Cache-Control', value: 'private, no-store' },
    ];
    return [
      ...['/casa', '/casa/:path*', '/entrar', '/api/auth/:path*', '/apagado'].map((source) => ({ source, headers: privada })),
      {
        source: '/s/:path*',
        headers: [
          // No page a Tester opens hands their link to another site, nor lets a
          // search engine or a shared cache keep it.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        // Daniel's panel: every tester's data. Never cached, indexed or referred.
        source: '/admin/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/admin',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
