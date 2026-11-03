// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { isMeasureAvailable, RENDER_DIR_PREFIX, RenderError, renderResume } from './index';
import { isTectonicAvailable } from './resume';

import sampleSelection from './__fixtures__/sample-selection.json';

/** The directories a render leaves in the system temp dir, by their prefix. */
function leftovers(): string[] {
  return readdirSync(tmpdir()).filter((name) => name.startsWith(RENDER_DIR_PREFIX));
}

describe('renderResume', () => {
  it('refuses a malformed Selection before touching the disk', async () => {
    const before = leftovers();
    await expect(renderResume({ ...sampleSelection, sections: [] })).rejects.toThrow(RenderError);
    expect(leftovers()).toEqual(before);
  });

  it.skipIf(!isTectonicAvailable() || !isMeasureAvailable())(
    'returns the PDF and its measure, and leaves nothing on disk',
    async () => {
      const before = leftovers();
      const { pdf, medida } = await renderResume(sampleSelection);

      expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
      expect(pdf.length).toBeGreaterThan(1000);

      expect(medida.pages).toBe(1);
      expect(medida.fill).toBeGreaterThan(0);
      expect(medida.groups).toContainEqual({
        section: 'Experience',
        group: 'Acme Corp',
        lines: [1, 1],
      });
      // The fixture is short and its Experience group has two bullets, so the
      // page rules flag it — a violation is reported, not thrown.
      expect(medida.problems.length).toBeGreaterThan(0);
      expect(Array.isArray(medida.orphans)).toBe(true);

      // Another test file may be rendering at the same time, with its own temp
      // directory: wait for it to clean up rather than count it as ours.
      await expect.poll(() => leftovers().filter((d) => !before.includes(d)), { timeout: 60_000, interval: 500 }).toEqual([]);
    },
    120_000,
  );
});
