import { z } from 'zod';
import { Tool } from '@/ai/agent-sdk';
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { v4 as uuidv4 } from 'uuid';

// Helper to get OpenAI client for embeddings via Gateway
// @ts-ignore Env is global
async function getEmbeddingClient(env: Env) {
  const gatewayId = env.AI_GATEWAY_NAME || 'rag';
  const gateway = env.AI.gateway(gatewayId);
  const baseUrl = await gateway.getUrl("openai"); // Specific OpenAI endpoint for real ada-002
  
  return new OpenAI({
    apiKey: await env.AI_GATEWAY_TOKEN.get(),
    baseURL: baseUrl,
  });
}

// Helper for vector normalization (L2)
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector; // Avoid division by zero
  return vector.map(val => val / magnitude);
}

/**
 * Tool for searching the Vectorize index.
 * Generates an embedding for the query and searches the index.
 */
// @ts-ignore Env is global
export const VectorizeSearchTool = (env: Env): Tool => ({
  name: 'vectorize_search',
  description: 'Search the semantic vector index for relevant documents. Returns closest matches.',
  parameters: z.object({
    query: z.string().describe('The search query string.'),
    topK: z.number().optional().default(5).describe('Number of results to return.'),
    isTest: z.boolean().optional().default(false).describe('If true, include test vectors.')
  }),
  execute: async ({ query, topK, isTest = false }: { query: string; topK?: number; isTest?: boolean }) => {
    try {
      const client = await getEmbeddingClient(env);
      const embeddingResponse = await client.embeddings.create({
        model: 'text-embedding-ada-002', // Vectorize configured with this model
        input: query
      });
      const rawVector = embeddingResponse.data[0].embedding;
      const vector = normalizeVector(rawVector);
      
      const filter = !isTest ? { is_testing_ignore: false } : undefined;

      const matches = await env.VECTORIZE.query(vector, { topK, returnMetadata: true, filter });
      return matches;
    } catch (e: any) {
      return { error: e.message };
    }
  }
});

/**
 * Tool for upserting text into the Vectorize index.
 * Chunks the text, generates embeddings, and inserts them.
 * Uses langchain RecursiveCharacterTextSplitter.
 */
// @ts-ignore Env is global
export const VectorizeUpsertTool = (env: Env): Tool => ({
  name: 'vectorize_upsert',
  description: 'Chunk, embed, and upsert text into the vector index. Associates vectors with a document ID.',
  parameters: z.object({
    documentId: z.string().describe('The ID of the parent document (e.g. from a D1 table).'),
    text: z.string().describe('The full text content to index.'),
    metadata: z.record(z.string(), z.any()).optional().describe('Additional metadata to store with vectors.'),
    isTest: z.boolean().optional().default(false).describe('If true, marks vectors as test data.')
  }),
  execute: async ({ documentId, text, metadata = {}, isTest = false }: { documentId: string; text: string; metadata?: Record<string, any>; isTest?: boolean }) => {
    try {
      // 1. Chunking
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const chunks = await splitter.createDocuments([text]);

      if (chunks.length === 0) return { success: true, count: 0 };

      // 2. Embeddings
      const client = await getEmbeddingClient(env);
      // Batch embedding generation (check limits, but usually fine for reasonable docs)
      const textsToEmbed = chunks.map(c => c.pageContent);
      
      const embeddingResponse = await client.embeddings.create({
        model: 'text-embedding-ada-002', // Vectorize configured with this model
        input: textsToEmbed
      });

      // 3. Prepare Vectorize records
      const vectors = embeddingResponse.data.map((item, index) => ({
        id: `${documentId}_chunk_${index}`, // Unique ID for chunk
        values: normalizeVector(item.embedding),
        metadata: {
          ...metadata,
          documentId: documentId,
          text: chunks[index].pageContent,
          chunkIndex: index,
          is_testing_ignore: isTest // Populated here
        }
      }));

      // 4. Upsert (Vectorize has batch limits, typically 1000, usually fine here)
      const inserted = await env.VECTORIZE.upsert(vectors);

      return {
        success: true,
        count: vectors.length,
        inserted
      };

    } catch (e: any) {
      return { error: e.message };
    }
  }
});
