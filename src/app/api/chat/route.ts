// Gemini REST API: text + images + PDF, modes, profile, projects, automatic model fallback.

const BASE_PROMPT =
  "You are ConvoAI, a helpful, accurate and friendly AI assistant. " +
  "Give clear, well-structured answers. " +
  "If the user shares an image or file, examine it carefully before answering. " +
  "Use emoji sparingly, and never use flag emojis.";

const MODE_PROMPTS: Record<string, string> = {
  friendly:
    "Style: warm, casual and friendly, like a helpful friend. Short paragraphs.",
  study:
    "Style: patient teacher. Explain concepts step by step with simple examples and analogies. At the end, ask one short practice question.",
  coder:
    "Style: senior developer. Give working code in fenced code blocks with a language tag, a short explanation, and mention edge cases or bugs. Keep code and identifiers in English.",
  pro:
    "Style: professional and concise. Give structured, formal answers. No slang and no emoji.",
};

const AUTO_LANGUAGE_RULE =
  "LANGUAGE RULE (very important): Always reply in the same language and script as the user's LATEST message. " +
  "If the latest message is in English, reply fully in English. " +
  "If it is in Hindi written in Devanagari script, reply in Hindi (Devanagari). " +
  "If it is in Hinglish (Hindi written in Roman letters, often mixed with English words), reply in Hinglish. " +
  "For any other language, reply in that language. " +
  "Decide using only the latest user message, not earlier messages and not these instructions, and switch immediately when the user switches. " +
  "Never answer an English message in Hinglish. " +
  "If the latest message has no clear language (for example just a number or a code), keep the language of the previous user message.";

type Profile = { name?: string; about?: string };
type Project = { name?: string; instructions?: string };

function clean(s: unknown, max: number) {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function buildSystemPrompt(
  mode: string | undefined,
  profile: Profile | undefined,
  project: Project | undefined
) {
  const parts = [BASE_PROMPT];
  parts.push(MODE_PROMPTS[mode ?? ""] ?? MODE_PROMPTS.friendly);

  const name = clean(profile?.name, 40);
  const about = clean(profile?.about, 300);
  if (name) {
    parts.push("The user's name is " + name + ". Use it occasionally, not in every message.");
  }
  if (about) {
    parts.push("Background about the user (context only, mention only if relevant): " + about);
  }

  const pName = clean(project?.name, 80);
  const pInstr = clean(project?.instructions, 2000);
  if (pInstr) {
    parts.push(
      "The user is working inside a project" +
        (pName ? ' named "' + pName + '"' : "") +
        ". Follow these project instructions: " +
        pInstr
    );
  }

  // Language rule sabse last mein, taaki sabse zyada asar kare
  parts.push(AUTO_LANGUAGE_RULE);
  return parts.join(" ");
}

const MODELS = Array.from(
  new Set(
    [
      process.env.GEMINI_MODEL,
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash",
    ].filter((m): m is string => Boolean(m))
  )
);

const RETRYABLE = new Set([429, 500, 503, 404]);

type Attachment = {
  name: string;
  mimeType: string;
  kind: "image" | "pdf" | "text";
  data: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
};

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toParts(m: ChatMessage): Part[] {
  const parts: Part[] = [];

  for (const a of m.attachments ?? []) {
    if (!a.data) continue;
    if (a.kind === "text") {
      parts.push({ text: "File: " + a.name + "\n\n" + a.data });
    } else {
      parts.push({ inlineData: { mimeType: a.mimeType, data: a.data } });
    }
  }

  const text = (m.content ?? "").trim();
  if (text) {
    parts.push({ text });
  } else if (parts.length > 0) {
    parts.push({ text: "Look at this file and tell me what it contains." });
  }
  return parts;
}

async function callGemini(model: string, apiKey: string, body: unknown) {
  return fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      model +
      ":generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    }
  );
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "GEMINI_API_KEY .env.local mein nahi mili. Server restart kiya?" },
        { status: 500 }
      );
    }

    const { messages, mode, profile, project } = (await req.json()) as {
      messages: ChatMessage[];
      mode?: string;
      profile?: Profile;
      project?: Project;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages required" }, { status: 400 });
    }

    const contents = messages
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: toParts(m),
      }))
      .filter((c) => c.parts.length > 0);

    if (contents.length === 0) {
      return Response.json({ error: "Empty message" }, { status: 400 });
    }

    const body = {
      systemInstruction: { parts: [{ text: buildSystemPrompt(mode, profile, project) }] },
      contents,
      generationConfig: { maxOutputTokens: 4096 },
    };

    let lastError = "Gemini API error";
    let lastStatus = 500;

    for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await callGemini(model, apiKey, body);
        const data = await res.json();

        if (res.ok) {
          const parts: { text?: string }[] =
            data?.candidates?.[0]?.content?.parts ?? [];
          const reply = parts.map((p) => p.text ?? "").join("");
          if (reply) {
            console.log("Reply from model:", model);
            return Response.json({ reply, model });
          }
          lastError = "Empty reply (the safety filter may have blocked it)";
          lastStatus = 502;
          break;
        }

        lastError = data?.error?.message || "Gemini API error";
        lastStatus = res.status;
        console.error("Gemini error on " + model + ":", res.status, lastError);

        if (!RETRYABLE.has(res.status)) {
          return Response.json({ error: lastError }, { status: res.status });
        }
        if (attempt === 0 && res.status !== 404 && res.status !== 429) {
          await sleep(1200);
        } else {
          break;
        }
      }
    }

    return Response.json(
      { error: "All models are busy right now. Please try again in a bit. (" + lastError + ")" },
      { status: lastStatus }
    );
  } catch (error) {
    console.error("Chat API error:", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return Response.json({ error: message }, { status: 500 });
  }
}