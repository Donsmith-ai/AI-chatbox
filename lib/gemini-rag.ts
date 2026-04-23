import fs from "fs";
import path from "path";
import type { Content, Part } from "@google/generative-ai";
import { FileState, GoogleAIFileManager } from "@google/generative-ai/server";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type KnowledgeFileRef = { uri: string; mimeType: string };

export const RAG_SYSTEM_INSTRUCTION =
  "You are a helpful assistant. Use only information that appears in this chat. " +
  "Do not use outside knowledge or the web. Keep answers concise. " +
  "If you cannot answer from this chat alone, reply exactly with: I don't have that information.";

let cachedUploadPromise: Promise<KnowledgeFileRef> | null = null;

/** Project folder where knowledge PDFs live (see also `GEMINI_RAG_PDF_PATH`). */
const RAG_STORE_DIR = "file_search_store";
const DEFAULT_KNOWLEDGE_FILENAME = "Lupin_III_Knowledge_Base.pdf";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function resolveDefaultKnowledgePdfAbs(): string {
  const store = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    RAG_STORE_DIR,
  );
  const preferred = path.join(store, DEFAULT_KNOWLEDGE_FILENAME);
  if (fs.existsSync(preferred)) {
    return preferred;
  }
  if (!fs.existsSync(store)) {
    throw new Error(
      `Knowledge folder not found at "${store}". Create a "${RAG_STORE_DIR}" folder with a PDF, or set GEMINI_RAG_PDF_PATH / GEMINI_FILE_URI.`,
    );
  }
  const pdfs = fs
    .readdirSync(store)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();
  if (pdfs.length === 0) {
    throw new Error(
      `No PDF found in "${store}". Add a .pdf under "${RAG_STORE_DIR}/" or set GEMINI_RAG_PDF_PATH.`,
    );
  }
  return path.join(store, pdfs[0]);
}

export function getKnowledgeFileRef(apiKey: string): Promise<KnowledgeFileRef> {
  const uri = process.env.GEMINI_FILE_URI?.trim();
  if (uri) {
    const mimeType =
      process.env.GEMINI_FILE_MIME_TYPE?.trim() || "application/pdf";
    return Promise.resolve({ uri, mimeType });
  }

  if (!cachedUploadPromise) {
    cachedUploadPromise = uploadKnowledgePdf(apiKey);
  }

  return cachedUploadPromise;
}

async function uploadKnowledgePdf(apiKey: string): Promise<KnowledgeFileRef> {
  const configured = process.env.GEMINI_RAG_PDF_PATH?.trim();
  const absolute = configured
    ? path.isAbsolute(configured)
      ? configured
      : path.join(
          /* turbopackIgnore: true */ process.cwd(),
          configured,
        )
    : resolveDefaultKnowledgePdfAbs();

  if (!fs.existsSync(absolute)) {
    throw new Error(
      `Knowledge PDF not found at "${absolute}". Use a path under "${RAG_STORE_DIR}/" or set GEMINI_RAG_PDF_PATH / GEMINI_FILE_URI.`,
    );
  }

  const fileManager = new GoogleAIFileManager(apiKey);
  const uploadResult = await fileManager.uploadFile(absolute, {
    mimeType: "application/pdf",
    displayName: "rag-knowledge-base",
  });

  let file = uploadResult.file;
  let attempts = 0;
  const maxAttempts = 120;

  while (file.state === FileState.PROCESSING && attempts < maxAttempts) {
    await sleep(1500);
    file = await fileManager.getFile(file.name);
    attempts += 1;
  }

  if (file.state !== FileState.ACTIVE) {
    const err = file.error?.message ?? "unknown error";
    throw new Error(
      `Knowledge PDF could not be processed (state: ${file.state}). ${err}`,
    );
  }

  return { uri: file.uri, mimeType: file.mimeType };
}

export function stripLeadingAssistantTurns(messages: ChatTurn[]): ChatTurn[] {
  let i = 0;
  while (i < messages.length && messages[i].role === "assistant") {
    i += 1;
  }
  return messages.slice(i);
}

export function buildRagContents(
  messages: ChatTurn[],
  file: KnowledgeFileRef,
): Content[] {
  const trimmed = stripLeadingAssistantTurns(messages);
  if (trimmed.length === 0) {
    throw new Error("No user messages to send to the model.");
  }

  const contents: Content[] = trimmed.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }] as Part[],
  }));

  const firstUserIndex = contents.findIndex((c) => c.role === "user");
  if (firstUserIndex === -1) {
    throw new Error("Conversation must include at least one user message.");
  }

  const filePart: Part = {
    fileData: { fileUri: file.uri, mimeType: file.mimeType },
  };

  const userParts = contents[firstUserIndex].parts as Part[];
  contents[firstUserIndex] = {
    role: "user",
    parts: [filePart, ...userParts],
  };

  return contents;
}
