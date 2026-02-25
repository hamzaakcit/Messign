interface ChunkReference {
  chunkText: string;
  documentId: string;
}

export async function synthesizeAnswer(
  query: string,
  chunks: ChunkReference[]
): Promise<ReadableStream> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const context = chunks
    .map((c, i) => `[Kaynak ${i + 1} - ${c.documentId}]\n${c.chunkText}`)
    .join("\n\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "You are a knowledge base assistant. Answer the user's question using only the provided context. If the context doesn't contain the answer, say so. Respond in Turkish.",
        },
        {
          role: "user",
          content: `Soru: ${query}\n\nBağlam:\n${context}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  return response.body as ReadableStream;
}
