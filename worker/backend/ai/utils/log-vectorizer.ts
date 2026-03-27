import { generateEmbeddings } from "@/ai/providers";

export async function vectorizeAndStoreLogs(env: Env, runId: string, rawLogs: any[]) {
  const BATCH_SIZE = 50; 
  
  const chunks = rawLogs.map(log => 
    typeof log === "string" ? log : JSON.stringify(log)
  ); 
  
  let insertedCount = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    
    // Generate embeddings using our provider wrapper
    const embeddings = await generateEmbeddings(env, batch);

    // Format for Vectorize
    const vectors = embeddings.map((embedding: number[], index: number) => ({
      id: `${runId}-log-${i + index}`,
      values: embedding,
      metadata: {
        runId,
        content: batch[index] // Store the raw text in metadata for easy retrieval
      }
    }));

    // Insert into Vectorize using the existing binding
    await env.VECTORIZE_LOGS.insert(vectors);
    insertedCount += vectors.length;
  }

  return insertedCount;
}
