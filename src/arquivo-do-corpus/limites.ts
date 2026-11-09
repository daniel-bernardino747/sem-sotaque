// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The Corpus file's size limit, apart so the browser's form reads it without
 * the format (zod and the schema). Larger than any Corpus a conversation
 * builds, and under the Server Action's body limit (`next.config.ts`).
 */
export const LIMITE_ARQUIVO = 5 * 1024 * 1024;
