export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[embeddings] OPENAI_API_KEY is not set");
      return [];
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[embeddings] OpenAI API error:", response.status, error);
      return [];
    }

    const data = await response.json();
    return data.data[0].embedding as number[];
  } catch (error) {
    console.error("[embeddings] Failed to generate embedding:", error);
    return [];
  }
}
