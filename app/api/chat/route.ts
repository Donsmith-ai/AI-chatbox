import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  generateContentReliable,
  parseModelFallbackList,
} from "@/lib/gemini-generate-reliable";
import {
  logChatAssistantReply,
  logChatError,
  logChatRequest,
} from "@/lib/chat-server-log";
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
      { error: "Something went wrong. Please try again later." },
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

    logChatRequest(messages, {
      ragEnabled: !ragDisabled,
      modelCandidates,
    });

    // Retries 503/429 (capacity) and falls back to other models if needed.
    const { result, modelName: modelUsed } = await generateContentReliable(
      modelCandidates,
      getModel,
      { contents },
    );
    const text = result.response.text();

    logChatAssistantReply(text, { modelUsed });

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
    logChatError(message);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 },
    );
  }
}
