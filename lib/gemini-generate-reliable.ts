import {
  GoogleGenerativeAIFetchError,
  type GenerativeModel,
} from "@google/generative-ai";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isModelNotFound(error: unknown): boolean {
  if (error instanceof GoogleGenerativeAIFetchError && error.status === 404) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("404") &&
    (message.includes("not found") ||
      message.includes("not available") ||
      message.includes("no longer available"))
  );
}

function isTransientCapacityError(error: unknown): boolean {
  if (error instanceof GoogleGenerativeAIFetchError) {
    const status = error.status;
    return status === 503 || status === 429;
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("503") ||
    message.includes("429") ||
    message.includes("high demand") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("try again later")
  );
}

/**
 * Retries transient overload errors and tries fallback model IDs when the API
 * returns 404 or repeated 503/429 on a model.
 */
export async function generateContentReliable(
  models: string[],
  getModel: (modelName: string) => GenerativeModel,
  request: Parameters<GenerativeModel["generateContent"]>[0],
): Promise<Awaited<ReturnType<GenerativeModel["generateContent"]>>> {
  const delaysMs = [700, 1800, 4000];
  let lastError: unknown;

  for (const modelName of models) {
    const model = getModel(modelName);

    for (let attempt = 0; attempt < delaysMs.length; attempt++) {
      try {
        return await model.generateContent(request);
      } catch (error) {
        lastError = error;

        if (isModelNotFound(error)) {
          break;
        }

        if (isTransientCapacityError(error)) {
          if (attempt < delaysMs.length - 1) {
            await sleep(delaysMs[attempt] ?? 4000);
            continue;
          }
          break;
        }

        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Unable to generate content from the model.");
}

export function parseModelFallbackList(
  primary: string,
  raw: string | undefined,
): string[] {
  const extras = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [primary, ...extras]) {
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
