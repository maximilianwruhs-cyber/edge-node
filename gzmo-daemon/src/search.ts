/**
 * search.ts — Vault Semantic Search
 *
 * Cosine similarity search against embedded vault chunks.
 * Returns top-K relevant chunks for LLM context injection.
 *
 * Source: Local RAG notebook (NotebookLM)
 */

import type { EmbeddingChunk, EmbeddingStore } from "./embeddings";

// ── Core Search ────────────────────────────────────────────────────

export interface SearchResult {
  file: string;
  heading: string;
  text: string;
  score: number;
}

/**
 * Search the embedding store for chunks most similar to the query.
 */
export async function searchVault(
  query: string,
  store: EmbeddingStore,
  ollamaUrl: string = "http://localhost:11434",
  topK: number = 3,
): Promise<SearchResult[]> {
  if (store.chunks.length === 0) return [];

  // Embed the query
  const resp = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: store.modelName, prompt: query }),
  });

  if (!resp.ok) {
    console.warn(`[SEARCH] Embedding query failed: ${resp.status}`);
    return [];
  }

  const data = await resp.json() as { embedding: number[] };
  const queryVec = data.embedding;

  // Score all chunks
  const scored = store.chunks
    .map((chunk) => ({
      file: chunk.file,
      heading: chunk.heading,
      text: chunk.text,
      score: cosineSimilarity(queryVec, chunk.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

/**
 * Format search results as context for the LLM system prompt.
 */
export function formatSearchContext(results: SearchResult[]): string {
  if (results.length === 0) return "";

  const sections = results.map((r, i) =>
    `[${i + 1}] ${r.file} — ${r.heading} (relevance: ${(r.score * 100).toFixed(0)}%):\n${r.text}`
  );

  return `\n## Relevant Vault Context\n${sections.join("\n\n")}`;
}

// ── Math ───────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
