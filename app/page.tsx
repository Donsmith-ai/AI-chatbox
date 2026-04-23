"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingRaceCar } from "@/components/ThinkingRaceCar";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const INITIAL_ASSISTANT_MESSAGE = "Hi! What would you like to know?";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: INITIAL_ASSISTANT_MESSAGE },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const prompt = input.trim();
    if (!prompt || isLoading) {
      return;
    }

    const history = [...messages, { role: "user" as const, content: prompt }];
    setInput("");
    setIsLoading(true);
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok) {
        throw new Error("request failed");
      }

      if (!response.body) {
        throw new Error("no body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        accumulatedText += decoder.decode(value, { stream: true });
        setMessages((current) => {
          const updated = [...current];
          updated[updated.length - 1] = {
            role: "assistant",
            content: accumulatedText,
          };
          return updated;
        });
      }
    } catch {
      setMessages((current) => {
        const updated = [...current];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-dvh w-full max-w-4xl flex-col bg-white p-4 text-zinc-900 sm:p-6">
      <header className="mb-4 rounded-xl border border-blue-200/80 bg-blue-100 px-4 py-4">
        <h1 className="text-xl font-semibold text-blue-950">LUPIN CHAT BOX</h1>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
              message.role === "user"
                ? "ml-auto bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-900"
            }`}
          >
            {message.role === "assistant" ? (
              <article className="prose prose-sm max-w-none prose-p:my-2 prose-pre:my-2">
                {message.content === "" && isLoading ? (
                  <ThinkingRaceCar />
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                )}
              </article>
            ) : (
              message.content
            )}
          </div>
        ))}
        <div ref={endOfMessagesRef} />
      </main>

      <form onSubmit={sendMessage} className="mt-auto flex gap-2 border-t border-zinc-200 pt-4">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type your message..."
          className="flex-1 rounded-xl border border-blue-500/50 bg-blue-600 px-4 py-3 text-sm text-white outline-none transition placeholder:text-blue-100/75 focus:border-blue-300 focus:ring-2 focus:ring-blue-300/35 disabled:cursor-not-allowed disabled:bg-blue-600/55 disabled:text-white/85"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isLoading ? "Streaming..." : "Send"}
        </button>
      </form>
    </div>
  );
}
