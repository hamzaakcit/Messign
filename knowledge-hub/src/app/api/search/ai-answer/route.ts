import { NextResponse, type NextRequest } from "next/server";
import { semanticSearch } from "@/lib/ai/semantic-search";
import { synthesizeAnswer } from "@/lib/ai/ai-synthesizer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    const chunks = await semanticSearch(query, 5);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No relevant documents found" },
        { status: 404 }
      );
    }

    const sourceDocumentIds = [
      ...new Set(chunks.map((c) => c.documentId)),
    ];

    const stream = await synthesizeAnswer(query, chunks);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Source-Documents": JSON.stringify(sourceDocumentIds),
      },
    });
  } catch (error) {
    console.error("[api/search/ai-answer] POST", error);
    return NextResponse.json(
      { error: "AI answer generation failed" },
      { status: 500 }
    );
  }
}
