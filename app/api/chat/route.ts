import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  generateContentReliable,
  parseModelFallbackList,
} from "@/lib/gemini-generate-reliable";
import {
  buildRagContents,
  getKnowledgeFileRef,
  RAG_SYSTEM_INSTRUCTION,
  type ChatTurn,
} from "@/lib/gemini-rag";

/** Allow longer model generations on serverless hosts (e.g. Vercel). */
export const maxDuration = 120;

export async function POST(request: Request) {
  const apiKey =
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) environment variable.",
      },
      { status: 500 },
    );
  }

  try {
    const { messages } = (await request.json()) as { messages?: ChatTurn[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages must be a non-empty array." },
        { status: 400 },
      );
    }

    const primaryModel = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const modelCandidates = parseModelFallbackList(
      primaryModel,
      process.env.GEMINI_MODEL_FALLBACKS ??
        "gemini-2.5-flash-lite,gemini-2.0-flash,gemini-1.5-flash",
    );
    const genAI = new GoogleGenerativeAI(apiKey);
    const ragDisabled =
      process.env.GEMINI_RAG === "false" || process.env.GEMINI_RAG === "0";

    const getModel = (name: string) =>
      genAI.getGenerativeModel({
        model: name,
        ...(ragDisabled
          ? {}
          : { systemInstruction: RAG_SYSTEM_INSTRUCTION }),
      });

    const contents = ragDisabled
      ? messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        }))
      : buildRagContents(messages, await getKnowledgeFileRef(apiKey));

    // Retries 503/429 (capacity) and falls back to other models if needed.
    const result = await generateContentReliable(
      modelCandidates,
      getModel,
      { contents },
    );
    const text = result.response.text();

    return new Response(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Streaming chat error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Unable to generate chat response.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
