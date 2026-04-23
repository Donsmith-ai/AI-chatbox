import type { ChatTurn } from "@/lib/gemini-rag";

const SEP = "=".repeat(72);

function enabled() {
  return process.env.CHAT_SERVER_LOG !== "false" && process.env.CHAT_SERVER_LOG !== "0";
}

function banner(label: string) {
  const ts = new Date().toISOString();
  console.log(`\n${SEP}\n[chatbox] ${ts} — ${label}\n${SEP}`);
}

export function logChatRequest(
  messages: ChatTurn[],
  meta: {
    ragEnabled: boolean;
    modelCandidates: string[];
  },
) {
  if (!enabled()) {
    return;
  }

  banner("Incoming conversation (client → API)");
  console.log(`RAG: ${meta.ragEnabled ? "on" : "off"}`);
  console.log(`Models (try order): ${meta.modelCandidates.join(" → ")}`);
  console.log("");

  messages.forEach((m, i) => {
    console.log(`${i + 1}. [${m.role.toUpperCase()}]`);
    console.log(m.content);
    console.log("");
  });

  console.log(SEP);
}

export function logChatAssistantReply(text: string, meta?: { modelUsed?: string }) {
  if (!enabled()) {
    return;
  }

  banner("Assistant reply (API → client)");
  if (meta?.modelUsed) {
    console.log(`Model used: ${meta.modelUsed}\n`);
  }
  console.log(text);
  console.log(`\n${SEP}\n`);
}

export function logChatError(message: string) {
  if (!enabled()) {
    return;
  }

  banner("Error");
  console.error(message);
  console.error(`${SEP}\n`);
}
