"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SiteFooter from "@/components/SiteFooter";
import LanguageMenu from "@/components/LanguageMenu";
import { rich, useT } from "@/lib/i18n";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderPlus,
  GraduationCap,
  Image as ImageIcon,
  Languages,
  Lightbulb,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Mic,
  Moon,
  Menu,
  ChevronsLeft,
  PenLine,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Share,
  Share2,
  Smile,
  Sparkles,
  Sun,
  Trash2,
  UploadCloud,
  User,
  X,
} from "lucide-react";

/* ================= Types ================= */
type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "pdf" | "text";
  data?: string; // image/pdf = base64, text = plain text. Saved chats mein nahi hota.
};

type Message = {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
};

type Conversation = {
  id: string;
  title: string;
  projectId?: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

type Project = {
  id: string;
  name: string;
  instructions: string;
  createdAt: number;
};

type Provider = "google" | "local";
type Profile = {
  name: string;
  about: string;
  provider: Provider;
  email: string;
  picture?: string;
};

type ModeId = "friendly" | "study" | "coder" | "pro";
type IconType = React.ComponentType<{ size?: number; className?: string }>;

type SpeechEventLike = {
  results: { length: number; [i: number]: { 0: { transcript: string } } };
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type GoogleTokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type GoogleOAuth2 = {
  initTokenClient: (cfg: {
    client_id: string;
    scope: string;
    callback: (r: { access_token?: string; error?: string }) => void;
    error_callback?: (e: { type?: string }) => void;
  }) => GoogleTokenClient;
};

/* ================= Constants ================= */
const GOOGLE_CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_MESSAGES: Message[] = [];

const MAX_FILES = 4;
const MAX_IMAGE_RAW = 15 * 1024 * 1024;
const MAX_PDF = 6 * 1024 * 1024;
const MAX_TEXT = 200 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const TEXT_EXT = [
  "txt", "md", "csv", "json", "js", "ts", "tsx", "jsx", "py", "java",
  "c", "cpp", "html", "css", "xml", "yml", "yaml", "sql", "log", "sh",
];
const ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*," +
  TEXT_EXT.map((e) => "." + e).join(",");

const MODES: { id: ModeId; label: string; desc: string; icon: IconType }[] = [
  { id: "friendly", label: "Friendly", desc: "Casual, like a friend", icon: Smile },
  { id: "study", label: "Study buddy", desc: "Explains step by step", icon: GraduationCap },
  { id: "coder", label: "Coder", desc: "Code, bugs and best practices", icon: Code },
  { id: "pro", label: "Professional", desc: "Formal and to the point", icon: Briefcase },
];

const AVATARS: [string, string][] = [
  ["#0ea5e9", "#38bdf8"],
  ["#2563eb", "#38bdf8"],
  ["#d97706", "#fbbf24"],
  ["#db2777", "#fb7185"],
  ["#7c3aed", "#a78bfa"],
  ["#334155", "#64748b"],
];

type Chip = { label: string; icon: IconType; action: "fill" | "upload"; text?: string };

const CHIPS: Chip[] = [
  { label: "Help me write", icon: PenLine, action: "fill", text: "Help me write " },
  { label: "Learn about", icon: BookOpen, action: "fill", text: "Teach me about " },
  { label: "Analyze image", icon: ImageIcon, action: "upload" },
  { label: "Summarize text", icon: AlignLeft, action: "fill", text: "Summarize this text:\n\n" },
];

const MORE_CHIPS: Chip[] = [
  { label: "Code help", icon: Code, action: "fill", text: "I need help with code: " },
  { label: "Brainstorm ideas", icon: Lightbulb, action: "fill", text: "Give me ideas for " },
  { label: "Translate", icon: Languages, action: "fill", text: "Translate this: " },
  { label: "Explain simply", icon: Sparkles, action: "fill", text: "Explain in simple words: " },
];

const HINTS = [
  "Ask me anything...",
  "Upload an image and ask what is in it...",
  "Drop in a PDF and ask for a summary...",
  "Write or debug some code...",
  "Practice for an interview...",
];

/* ================= Helpers ================= */
function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function colorIndex(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % AVATARS.length;
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File): Promise<{ data: string; mimeType: string }> {
  if (file.type === "image/gif") {
    return { data: await fileToBase64(file), mimeType: file.type };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not load the image"));
      i.src = url;
    });
    const max = 1600;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process the image");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", 0.85);
    return { data: out.split(",")[1], mimeType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function processFile(file: File): Promise<Attachment> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (IMAGE_TYPES.includes(file.type)) {
    if (file.size > MAX_IMAGE_RAW) throw new Error('"' + file.name + '" is too large (max 15MB)');
    const { data, mimeType } = await compressImage(file);
    return { id: makeId(), name: file.name, mimeType, kind: "image", data };
  }

  if (file.type === "application/pdf" || ext === "pdf") {
    if (file.size > MAX_PDF) throw new Error('"' + file.name + '" is too large (PDF max 6MB)');
    return {
      id: makeId(),
      name: file.name,
      mimeType: "application/pdf",
      kind: "pdf",
      data: await fileToBase64(file),
    };
  }

  if (file.type.startsWith("text/") || TEXT_EXT.includes(ext)) {
    if (file.size > MAX_TEXT) throw new Error('"' + file.name + '" is too large (text max 200KB)');
    return {
      id: makeId(),
      name: file.name,
      mimeType: "text/plain",
      kind: "text",
      data: await file.text(),
    };
  }

  throw new Error('"' + file.name + '" is not a supported file type');
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function imageSrc(a: Attachment) {
  return a.data ? "data:" + a.mimeType + ";base64," + a.data : "";
}

/* ----- storage: profile ----- */
function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem("convoai-profile");
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Profile>;
    if (!p.name || typeof p.name !== "string") return null;
    if (!p.email || typeof p.email !== "string") return null;
    return {
      name: p.name.slice(0, 40),
      about: typeof p.about === "string" ? p.about.slice(0, 300) : "",
      provider: p.provider === "google" ? "google" : "local",
      email: p.email,
      picture:
        typeof p.picture === "string" && p.picture.startsWith("https://")
          ? p.picture
          : undefined,
    };
  } catch {
    return null;
  }
}

function readAbout(email: string): string {
  try {
    return (localStorage.getItem("convoai-about:" + email.toLowerCase()) ?? "").slice(0, 300);
  } catch {
    return "";
  }
}

function writeAbout(email: string, about: string) {
  try {
    localStorage.setItem("convoai-about:" + email.toLowerCase(), about);
  } catch {
    /* ignore */
  }
}

/* ----- storage: chats and projects ----- */
function storeKey(userKey: string) {
  return "convoai-data-v1:" + userKey;
}

function loadStore(userKey: string): { chats: Conversation[]; projects: Project[] } {
  const empty = { chats: [] as Conversation[], projects: [] as Project[] };
  try {
    const raw = localStorage.getItem(storeKey(userKey));
    if (!raw) return empty;
    const d = JSON.parse(raw) as { chats?: unknown; projects?: unknown };

    const projects: Project[] = Array.isArray(d.projects)
      ? (d.projects as Partial<Project>[])
          .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
          .map((p) => ({
            id: p.id as string,
            name: (p.name as string).slice(0, 80),
            instructions: typeof p.instructions === "string" ? p.instructions.slice(0, 2000) : "",
            createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
          }))
      : [];

    const chats: Conversation[] = Array.isArray(d.chats)
      ? (d.chats as Partial<Conversation>[])
          .filter(
            (c) =>
              c &&
              typeof c.id === "string" &&
              typeof c.title === "string" &&
              Array.isArray(c.messages)
          )
          .map((c) => ({
            id: c.id as string,
            title: (c.title as string).slice(0, 80),
            projectId: typeof c.projectId === "string" ? c.projectId : undefined,
            messages: (c.messages as Partial<Message>[])
              .filter(
                (m) =>
                  m &&
                  (m.role === "user" || m.role === "assistant") &&
                  typeof m.content === "string"
              )
              .map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content as string,
                attachments: Array.isArray(m.attachments)
                  ? (m.attachments as Partial<Attachment>[])
                      .filter((a) => a && typeof a.name === "string")
                      .map((a) => ({
                        id: typeof a.id === "string" ? a.id : makeId(),
                        name: a.name as string,
                        mimeType: typeof a.mimeType === "string" ? a.mimeType : "application/octet-stream",
                        kind: (a.kind === "image" || a.kind === "pdf" ? a.kind : "text") as Attachment["kind"],
                      }))
                  : undefined,
              })),
            createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
            updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : Date.now(),
          }))
          .filter((c) => c.messages.length > 0)
      : [];

    return { chats, projects };
  } catch {
    return empty;
  }
}

function slim(chats: Conversation[]): Conversation[] {
  return chats.map((c) => ({
    ...c,
    messages: c.messages.map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments?.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        kind: a.kind,
      })),
    })),
  }));
}

function saveStore(userKey: string, chats: Conversation[], projects: Project[]) {
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const attempt = (n: number) =>
    localStorage.setItem(
      storeKey(userKey),
      JSON.stringify({ chats: slim(sorted.slice(0, n)), projects })
    );
  try {
    attempt(200);
  } catch {
    try {
      attempt(40);
    } catch {
      /* storage full */
    }
  }
}

/* ----- local accounts (browser only) ----- */
type Account = { name: string; salt: string; hash: string };
const ACCOUNTS_KEY = "convoai-accounts";

function readAccounts(): Record<string, Account> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const d = raw ? JSON.parse(raw) : {};
    return d && typeof d === "object" ? (d as Record<string, Account>) : {};
  } catch {
    return {};
  }
}

function toB64(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s);
}

function fromB64(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function hashPassword(password: string, salt: BufferSource): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return toB64(new Uint8Array(bits));
}

async function signUpLocal(name: string, email: string, password: string): Promise<Profile> {
  const accounts = readAccounts();
  if (accounts[email]) {
    throw new Error("An account with this email already exists. Please log in.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  accounts[email] = { name, salt: toB64(salt), hash };
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    throw new Error("Could not save your account in this browser.");
  }
  return { name, about: "", provider: "local", email };
}

async function logInLocal(email: string, password: string): Promise<Profile> {
  const acc = readAccounts()[email];
  if (!acc) throw new Error("Incorrect email or password.");
  const hash = await hashPassword(password, fromB64(acc.salt));
  if (hash !== acc.hash) throw new Error("Incorrect email or password.");
  return { name: acc.name, about: "", provider: "local", email };
}

/* ----- Google sign-in (popup, custom button) ----- */
function getGoogleOAuth(): GoogleOAuth2 | undefined {
  return (window as unknown as { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }).google
    ?.accounts?.oauth2;
}

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (getGoogleOAuth()) {
      resolve();
      return;
    }
    const existing = document.querySelector("script[data-gsi]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.setAttribute("data-gsi", "1");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(s);
  });
}

/* ----- chat utilities ----- */
function makeTitle(text: string, atts: Attachment[]) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t) return t.length > 44 ? t.slice(0, 44).trimEnd() + "..." : t;
  if (atts.length) return atts[0].name.slice(0, 44);
  return "New chat";
}

function groupByDate(chats: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  const buckets: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const c of chats) {
    const t = c.updatedAt;
    const idx = t >= startToday ? 0 : t >= startToday - day ? 1 : t >= startToday - 7 * day ? 2 : 3;
    buckets[idx].items.push(c);
  }
  return buckets.filter((b) => b.items.length > 0);
}

function chatToMarkdown(c: Conversation): string {
  const lines: string[] = ["# " + c.title, ""];
  for (const m of c.messages) {
    lines.push("**" + (m.role === "user" ? "You" : "ConvoAI") + ":**", "");
    for (const a of m.attachments ?? []) lines.push("_[Attached: " + a.name + "]_", "");
    if (m.content) lines.push(m.content, "");
  }
  return lines.join("\n");
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function projectPayload(projects: Project[], pid: string | null | undefined) {
  const p = projects.find((x) => x.id === pid);
  return p ? { name: p.name, instructions: p.instructions } : undefined;
}

function useOutside(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside, active]);
}

/* ================= Small components ================= */
function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="ConvoAI"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="convoai-logo-grad" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="38" rx="14" fill="url(#convoai-logo-grad)" />
      <path d="M9 36 L7 46 L19 39 Z" fill="url(#convoai-logo-grad)" />
      <path d="M31.3 14.9 A9.5 9.5 0 1 0 31.3 27.1" stroke="#ffffff" strokeWidth="4.2" strokeLinecap="round" />
      <circle cx="32.6" cy="21" r="2.4" fill="#ffffff" />
    </svg>
  );
}

function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex select-none items-center gap-2.5">
      <LogoMark size={Math.round(size * 1.6)} />
      <span style={{ fontSize: size }} className="font-display font-extrabold leading-none">
        Convo<span className="gradient-text">AI</span>
      </span>
    </span>
  );
}

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function Dots({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function Avatar({
  profile,
  size = 34,
}: {
  profile: Pick<Profile, "name" | "email" | "picture">;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [a, b] = AVATARS[colorIndex(profile.email || profile.name)];

  if (profile.picture && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.picture}
        alt={profile.name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: "linear-gradient(135deg, " + a + ", " + b + ")",
      }}
      className="flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
    >
      {profile.name.trim().charAt(0).toUpperCase() || "U"}
    </div>
  );
}

function CopyButton({
  text,
  label = false,
  tone = "light",
}: {
  text: string;
  label?: boolean;
  tone?: "light" | "dark";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  }

  const tint =
    tone === "dark"
      ? "text-gray-400 hover:bg-white/10 hover:text-white"
      : "text-muted hover:bg-surface2 hover:text-ink";

  return (
    <button
      onClick={copy}
      className={"flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition " + tint}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {(label || copied) && <span>{copied ? "Copied!" : "Copy"}</span>}
    </button>
  );
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const first = React.Children.toArray(children)[0];
  let lang = "code";
  if (React.isValidElement(first)) {
    const cn = (first.props as { className?: string }).className || "";
    const m = /language-(\w+)/.exec(cn);
    if (m) lang = m[1];
  }
  const text = extractText(children).replace(/\n$/, "");

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-[#0d1117] text-gray-100">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1">
        <span className="text-xs uppercase tracking-wider text-gray-400">{lang}</span>
        <CopyButton text={text} label tone="dark" />
      </div>
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-gray-100">
        {children}
      </pre>
    </div>
  );
}

function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        h1: ({ children }) => <h1 className="mb-2 mt-4 text-xl font-bold">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-bold">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 mt-3 text-base font-semibold">{children}</h3>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2 hover:text-accent-hover">
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-2 border-accent/60 pl-3 italic text-muted">{children}</blockquote>
        ),
        hr: () => <hr className="my-4 border-line" />,
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border-b border-line bg-surface2 px-3 py-2 font-semibold">{children}</th>,
        td: ({ children }) => <td className="border-b border-line/60 px-3 py-2">{children}</td>,
        code: ({ children }) => (
          <code className="rounded-md bg-surface2 px-1.5 py-0.5 font-mono text-[13px]">{children}</code>
        ),
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/* ================= Modals ================= */
function Modal({
  onClose,
  children,
  maxWidth = "max-w-md",
}: {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={
          "animate-scale-in relative max-h-[94dvh] w-full overflow-y-auto rounded-3xl border border-line bg-surface shadow-lift " +
          maxWidth
        }
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-muted transition hover:bg-surface2 hover:text-ink"
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-line bg-app px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-accent/60 focus:ring-4 focus:ring-accent/10";

function LoginModal({
  initialMode,
  notice,
  onAuth,
  onClose,
}: {
  initialMode: "login" | "signup";
  notice: boolean;
  onAuth: (p: Profile) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"form" | "google" | null>(null);
  const [gReady, setGReady] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (!cancelled) setGReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load Google. Check your internet connection.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function googleSignIn() {
    setError("");
    if (!GOOGLE_CLIENT_ID) {
      setShowSetup((v) => !v);
      return;
    }
    const oauth = getGoogleOAuth();
    if (!oauth || !gReady) {
      setError("Google is still loading. Please try again in a moment.");
      return;
    }
    setBusy("google");
    const client = oauth.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid email profile",
      callback: async (r) => {
        if (!r.access_token) {
          setError("Google sign-in failed. Please try again.");
          setBusy(null);
          return;
        }
        try {
          const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: "Bearer " + r.access_token },
          });
          const p = (await res.json()) as {
            name?: string;
            given_name?: string;
            email?: string;
            picture?: string;
          };
          if (!res.ok || !p.email) throw new Error("no email");
          onAuth({
            name: (p.name || p.given_name || p.email.split("@")[0]).slice(0, 40),
            about: "",
            provider: "google",
            email: p.email,
            picture: p.picture && p.picture.startsWith("https://") ? p.picture : undefined,
          });
        } catch {
          setError("Could not read your Google profile. Please try again.");
        } finally {
          setBusy(null);
        }
      },
      error_callback: (e) => {
        setBusy(null);
        if (e.type !== "popup_closed") {
          setError("Google sign-in was blocked or cancelled. Please allow popups and try again.");
        }
      },
    });
    client.requestAccessToken({ prompt: "select_account" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const em = email.trim().toLowerCase();
    if (mode === "signup" && !name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!EMAIL_RE.test(em)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy("form");
    try {
      const p =
        mode === "signup"
          ? await signUpLocal(name.trim().slice(0, 40), em, password)
          : await logInLocal(em, password);
      onAuth(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const isSignup = mode === "signup";

  const perks: { icon: IconType; label: string }[] = [
    { icon: ImageIcon, label: "Images" },
    { icon: FileText, label: "PDFs" },
    { icon: Code, label: "Code" },
    { icon: Mic, label: "Voice" },
    { icon: Languages, label: "9 languages" },
  ];

  return (
    <Modal onClose={onClose} maxWidth="max-w-4xl">
      <div className="grid md:grid-cols-2">
        {/* Left: brand panel */}
        <aside className="relative hidden flex-col items-center justify-center overflow-hidden border-r border-line bg-surface2/40 px-10 py-14 text-center md:flex">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
          />
          <div className="relative flex flex-col items-center">
            <div className="text-sm font-semibold">Built on</div>
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-sm">
              <GoogleG size={16} />
              Google Gemini
            </div>

            <h3 className="font-display mt-10 text-3xl font-bold leading-tight">
              Your all-in-one
              <br />
              <span className="gradient-text">AI assistant</span> for chats
            </h3>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Chat with AI, upload images and PDFs, write code, and learn in your own language.
            </p>

            <div className="mt-8 flex max-w-sm flex-wrap justify-center gap-2">
              {perks.map((p) => {
                const Icon = p.icon;
                return (
                  <span
                    key={p.label}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium shadow-sm"
                  >
                    <Icon size={13} className="text-accent" />
                    {p.label}
                  </span>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right: form */}
        <div className="flex flex-col justify-center p-6 pt-12 sm:p-10">
          <div className="mb-5 md:hidden">
            <Wordmark size={20} />
          </div>

          {notice && (
            <div className="animate-fade-up mb-5 flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm leading-relaxed">
              <Lock size={16} className="mt-0.5 shrink-0 text-accent" />
              <span>{t.loginRequired}</span>
            </div>
          )}

          <h2 className="font-display text-2xl font-bold sm:text-3xl">
            {isSignup ? t.createAccount : t.welcomeBack}
          </h2>
          <p className="mt-1.5 text-sm text-muted">{isSignup ? t.signupSub : t.loginSub}</p>

          <form onSubmit={submit} className="mt-6 space-y-3" noValidate>
            {isSignup && (
              <div className="relative">
                <User size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  autoComplete="name"
                  placeholder={t.fullName}
                  className={inputCls + " pl-10"}
                />
              </div>
            )}

            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder={t.emailAddr}
                className={inputCls + " pl-10"}
              />
            </div>

            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? t.passwordMin : t.password}
                className={inputCls + " pl-10 pr-11"}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted transition hover:text-ink"
              >
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            {error && (
              <div className="animate-fade-up rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy !== null}
              className="h-12 w-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-sm font-semibold text-white shadow-md shadow-sky-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "form" ? t.wait : isSignup ? t.createBtn : t.logIn}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <div className="h-px flex-1 bg-line" />
            or
            <div className="h-px flex-1 bg-line" />
          </div>

          <button
            type="button"
            onClick={googleSignIn}
            disabled={busy !== null}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-surface text-sm font-semibold shadow-sm transition hover:bg-surface2 disabled:opacity-60"
          >
            <GoogleG />
            {busy === "google" ? t.googleWaiting : t.google}
          </button>
          {showSetup && (
            <p className="animate-fade-up mt-2 rounded-xl bg-accent-soft px-3 py-2.5 text-xs leading-relaxed">
              Google login needs a Client ID. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID in your .env.local file
              and restart the dev server.
            </p>
          )}

          <p className="mt-6 text-center text-sm text-muted">
            {isSignup ? t.haveAccount : t.noAccount}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? "login" : "signup");
                setError("");
              }}
              className="font-semibold text-accent hover:underline"
            >
              {isSignup ? t.logIn : t.signUp}
            </button>
          </p>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
            <Lock size={12} />
            {t.browserNote}
          </p>
        </div>
      </div>
    </Modal>
  );
}
function ProfileModal({
  profile,
  onSave,
  onSignOut,
  onClose,
}: {
  profile: Profile;
  onSave: (name: string, about: string) => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [about, setAbout] = useState(profile.about);
  const canSave = name.trim().length > 0;

  return (
    <Modal onClose={onClose}>
      <div className="p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <Avatar profile={{ name, email: profile.email, picture: profile.picture }} size={54} />
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Your profile</h2>
            <p className="truncate text-sm text-muted">{profile.email}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              About you <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="e.g. I am a CS student learning Python."
              className={inputCls + " resize-none"}
            />
            <p className="mt-1.5 text-xs text-muted">ConvoAI uses this to personalise its answers.</p>
          </div>
        </div>

        <button
          onClick={() => canSave && onSave(name.trim().slice(0, 40), about.trim().slice(0, 300))}
          disabled={!canSave}
          className="mt-6 h-11 w-full rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save changes
        </button>
        <button
          onClick={onSignOut}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm text-muted transition hover:text-red-500"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </Modal>
  );
}

function ProjectModal({
  existing,
  onSave,
  onClose,
}: {
  existing: Project | null;
  onSave: (name: string, instructions: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [instructions, setInstructions] = useState(existing?.instructions ?? "");
  const canSave = name.trim().length > 0;

  return (
    <Modal onClose={onClose}>
      <div className="p-6 sm:p-7">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Folder size={22} />
        </div>
        <h2 className="mt-4 text-xl font-bold">{existing ? "Edit project" : "New project"}</h2>
        <p className="mt-1 text-sm text-muted">
          Projects group related chats. Instructions apply to every chat inside the project.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Project name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
              placeholder="e.g. Python Learning"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Instructions <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="e.g. Act as my Python mentor. Give short examples and ask a practice question at the end."
              className={inputCls + " resize-none"}
            />
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="h-11 flex-1 rounded-xl border border-line text-sm font-semibold transition hover:bg-surface2"
          >
            Cancel
          </button>
          <button
            onClick={() => canSave && onSave(name.trim().slice(0, 60), instructions.trim().slice(0, 2000))}
            disabled={!canSave}
            className="h-11 flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {existing ? "Save" : "Create project"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} maxWidth="max-w-sm">
      <div className="p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
          <Trash2 size={21} />
        </div>
        <h2 className="mt-4 text-lg font-bold">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="h-10 flex-1 rounded-xl border border-line text-sm font-semibold transition hover:bg-surface2"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="h-10 flex-1 rounded-xl bg-red-500 text-sm font-semibold text-white transition hover:bg-red-600"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ShareModal({ chat, onClose }: { chat: Conversation; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const md = chatToMarkdown(chat);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const fileBase = chat.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 50) || "chat";

  async function copy() {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard not available */
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: chat.title, text: md });
    } catch {
      /* cancelled */
    }
  }

  const rowCls =
    "flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm font-medium transition hover:border-accent/40 hover:bg-accent-soft";

  return (
    <Modal onClose={onClose}>
      <div className="p-6 sm:p-7">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Share2 size={21} />
        </div>
        <h2 className="mt-4 text-xl font-bold">Share chat</h2>
        <p className="mt-1 truncate text-sm text-muted">{chat.title}</p>

        <div className="mt-5 space-y-2.5">
          <button onClick={copy} className={rowCls}>
            {copied ? <Check size={18} className="text-accent" /> : <Copy size={18} className="text-accent" />}
            {copied ? "Copied to clipboard!" : "Copy conversation"}
          </button>
          <button onClick={() => downloadText(fileBase + ".md", md)} className={rowCls}>
            <Download size={18} className="text-accent" />
            Download as Markdown file
          </button>
          {canNativeShare && (
            <button onClick={nativeShare} className={rowCls}>
              <Share2 size={18} className="text-accent" />
              Share with other apps
            </button>
          )}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-muted">
          Public share links need an online database. That comes in a later step.
        </p>
      </div>
    </Modal>
  );
}

/* ================= Sidebar ================= */
type MenuState = {
  kind: "chat" | "project";
  id: string;
  x: number;
  top?: number;
  bottom?: number;
};

type SidebarProps = {
  chats: Conversation[];
  projects: Project[];
  activeId: string | null;
  activeProjectId: string | null;
  profile: Profile | null;
  theme: "light" | "dark";
  onClose: () => void;
  onNewChat: (projectId?: string) => void;
  onSelect: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onDeleteChat: (id: string) => void;
  onMoveChat: (id: string, projectId: string | null) => void;
  onShare: (id: string) => void;
  onNewProject: () => void;
  onEditProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  onLogin: (mode: "login" | "signup") => void;
  onEditProfile: () => void;
  onSignOut: () => void;
  onToggleTheme: () => void;
};

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger = false,
  trailing,
}: {
  icon: IconType;
  label: string;
  onClick: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition " +
        (danger ? "text-red-500 hover:bg-red-500/10" : "hover:bg-surface2")
      }
    >
      <Icon size={16} className={danger ? "" : "text-muted"} />
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  );
}

function NavRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: IconType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition hover:bg-surface2"
    >
      <Icon size={18} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Sidebar(props: SidebarProps) {
  const { t } = useT();
  const { chats, projects, activeId, activeProjectId, profile, theme } = props;

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<{ kind: "chat" | "project"; id: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const skipBlur = useRef(false);

  useOutside(userRef, () => setUserMenu(false), userMenu);

  useEffect(() => {
    if (!menu) return;
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (menuRef.current?.contains(el)) return;
      if (el.closest("[data-menu-trigger]")) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menu]);

  useEffect(() => {
    if (activeProjectId) {
      setExpanded((prev) => (prev[activeProjectId] ? prev : { ...prev, [activeProjectId]: true }));
    }
  }, [activeProjectId]);

  const q = query.trim().toLowerCase();
  const sorted = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt), [chats]);
  const filtered = sorted.filter(
    (c) =>
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.messages.some((m) => m.content.toLowerCase().includes(q))
  );
  const loose = filtered.filter((c) => !c.projectId || !projects.some((p) => p.id === c.projectId));
  const visibleProjects = projects.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || filtered.some((c) => c.projectId === p.id)
  );

  function toggleSearch() {
    if (searchOpen) setQuery("");
    setSearchOpen((v) => !v);
  }

  function openMenu(e: React.MouseEvent, kind: "chat" | "project", id: string) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const w = 224;
    const x = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const flip = window.innerHeight - r.bottom < 300;
    setMoveOpen(false);
    setMenu((prev) =>
      prev && prev.id === id && prev.kind === kind
        ? null
        : flip
          ? { kind, id, x, bottom: window.innerHeight - r.top + 4 }
          : { kind, id, x, top: r.bottom + 4 }
    );
  }

  function startRename(kind: "chat" | "project", id: string, current: string) {
    setMenu(null);
    skipBlur.current = false;
    setRenaming({ kind, id });
    setRenameValue(current);
  }

  function commitRename() {
    if (!renaming) return;
    const v = renameValue.trim();
    if (v) {
      if (renaming.kind === "chat") props.onRenameChat(renaming.id, v);
      else props.onRenameProject(renaming.id, v);
    }
    setRenaming(null);
  }

  const renameInput = (
    <input
      autoFocus
      value={renameValue}
      onChange={(e) => setRenameValue(e.target.value)}
      maxLength={80}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          skipBlur.current = true;
          commitRename();
        } else if (e.key === "Escape") {
          skipBlur.current = true;
          setRenaming(null);
        }
      }}
      onBlur={() => {
        if (skipBlur.current) {
          skipBlur.current = false;
          return;
        }
        commitRename();
      }}
      className="mx-2 my-1 min-w-0 flex-1 rounded-lg border border-accent/50 bg-surface px-2 py-1.5 text-sm outline-none ring-4 ring-accent/10"
    />
  );

  function renderChat(c: Conversation) {
    const active = c.id === activeId;
    const isRenaming = renaming?.kind === "chat" && renaming.id === c.id;
    const menuOpen = menu?.kind === "chat" && menu.id === c.id;
    return (
      <div
        key={c.id}
        className={
          "group relative flex items-center rounded-xl transition " +
          (active ? "bg-surface2" : "hover:bg-surface2/70")
        }
      >
        {isRenaming ? (
          renameInput
        ) : (
          <>
            <button
              onClick={() => props.onSelect(c.id)}
              title={c.title}
              className={
                "min-w-0 flex-1 truncate px-3 py-2 text-left text-sm " + (active ? "font-medium" : "")
              }
            >
              {c.title}
            </button>
            <button
              data-menu-trigger
              onClick={(e) => openMenu(e, "chat", c.id)}
              aria-label="Chat options"
              className={
                "mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-line hover:text-ink lg:opacity-0 lg:group-hover:opacity-100 " +
                (menuOpen ? "lg:opacity-100" : "")
              }
            >
              <Dots />
            </button>
          </>
        )}
      </div>
    );
  }

  const menuChat = menu?.kind === "chat" ? chats.find((c) => c.id === menu.id) : undefined;
  const menuProject = menu?.kind === "project" ? projects.find((p) => p.id === menu.id) : undefined;

  const menuNode =
    menu && (menuChat || menuProject) && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            style={{ left: menu.x, top: menu.top, bottom: menu.bottom }}
            className="animate-pop fixed z-[70] w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-lift"
          >
            {menuChat && !moveOpen && (
              <>
                <MenuItem
                  icon={Share2}
                  label={t.share}
                  onClick={() => {
                    setMenu(null);
                    props.onShare(menuChat.id);
                  }}
                />
                <MenuItem
                  icon={Pencil}
                  label="Rename"
                  onClick={() => startRename("chat", menuChat.id, menuChat.title)}
                />
                {(projects.length > 0 || menuChat.projectId) && (
                  <MenuItem
                    icon={Folder}
                    label="Move to project"
                    onClick={() => setMoveOpen(true)}
                    trailing={<ChevronRight size={14} className="text-muted" />}
                  />
                )}
                <div className="my-1 h-px bg-line" />
                <MenuItem
                  icon={Trash2}
                  label="Delete"
                  danger
                  onClick={() => {
                    setMenu(null);
                    props.onDeleteChat(menuChat.id);
                  }}
                />
              </>
            )}

            {menuChat && moveOpen && (
              <>
                <button
                  onClick={() => setMoveOpen(false)}
                  className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:bg-surface2"
                >
                  <ChevronDown size={13} className="rotate-90" />
                  Move to
                </button>
                <div className="max-h-56 overflow-y-auto">
                  {menuChat.projectId && (
                    <MenuItem
                      icon={MessageSquare}
                      label="Remove from project"
                      onClick={() => {
                        props.onMoveChat(menuChat.id, null);
                        setMenu(null);
                      }}
                    />
                  )}
                  {projects.map((p) => (
                    <MenuItem
                      key={p.id}
                      icon={Folder}
                      label={p.name}
                      onClick={() => {
                        props.onMoveChat(menuChat.id, p.id);
                        setMenu(null);
                      }}
                      trailing={
                        menuChat.projectId === p.id ? <Check size={14} className="text-accent" /> : undefined
                      }
                    />
                  ))}
                </div>
              </>
            )}

            {menuProject && (
              <>
                <MenuItem
                  icon={Plus}
                  label={t.newChatInProject}
                  onClick={() => {
                    setMenu(null);
                    props.onNewChat(menuProject.id);
                  }}
                />
                <MenuItem
                  icon={Pencil}
                  label="Edit instructions"
                  onClick={() => {
                    setMenu(null);
                    props.onEditProject(menuProject.id);
                  }}
                />
                <MenuItem
                  icon={PenLine}
                  label="Rename"
                  onClick={() => startRename("project", menuProject.id, menuProject.name)}
                />
                <div className="my-1 h-px bg-line" />
                <MenuItem
                  icon={Trash2}
                  label="Delete project"
                  danger
                  onClick={() => {
                    setMenu(null);
                    props.onDeleteProject(menuProject.id);
                  }}
                />
              </>
            )}
          </div>,
          document.body
        )
      : null;

  const labelCls = "px-3 pb-1 pt-5 text-xs font-medium text-muted";

  return (
    <aside
      className="flex h-dvh w-72 flex-col border-r border-line"
      style={{ background: "var(--sidebar-bg)" }}
    >
      {/* Top */}
      <div className="flex items-center justify-between px-3.5 pb-1 pt-3.5">
        <Wordmark size={19} />
        <button
          onClick={props.onClose}
          aria-label="Close sidebar"
          title="Close sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface2 hover:text-ink"
        >
          <ChevronsLeft size={19} />
        </button>
      </div>

      {/* Main actions */}
      <div className="px-2.5 pt-2">
        <NavRow icon={PenLine} label={t.newChat} onClick={() => props.onNewChat()} />
        <NavRow icon={Search} label={t.searchChats} onClick={toggleSearch} />
        {searchOpen && (
          <div className="animate-pop relative px-0.5 pb-1 pt-1">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchChats}
              className="h-10 w-full rounded-xl border border-line bg-surface pl-3.5 pr-9 text-sm outline-none transition placeholder:text-muted focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scroll area */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-4" onScroll={() => setMenu(null)}>
        {/* Projects */}
        <div className={labelCls}>{t.projects}</div>
        <NavRow icon={FolderPlus} label={t.newProject} onClick={props.onNewProject} />

        {visibleProjects.map((p) => {
          const projChats = filtered.filter((c) => c.projectId === p.id);
          const isOpen = Boolean(expanded[p.id]) || Boolean(q);
          const isRenaming = renaming?.kind === "project" && renaming.id === p.id;
          const menuOpen = menu?.kind === "project" && menu.id === p.id;
          return (
            <div key={p.id} className="mt-0.5">
              <div className="group relative flex items-center rounded-xl transition hover:bg-surface2/70">
                {isRenaming ? (
                  renameInput
                ) : (
                  <>
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                      className="flex h-10 min-w-0 flex-1 items-center gap-3 px-3 text-left text-sm font-medium"
                    >
                      <Folder size={18} className="shrink-0" />
                      <span className="truncate">{p.name}</span>
                    </button>
                    <button
                      data-menu-trigger
                      onClick={(e) => openMenu(e, "project", p.id)}
                      aria-label="Project options"
                      className={
                        "mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-line hover:text-ink lg:opacity-0 lg:group-hover:opacity-100 " +
                        (menuOpen ? "lg:opacity-100" : "")
                      }
                    >
                      <Dots />
                    </button>
                  </>
                )}
              </div>

              {isOpen && (
                <div className="ml-5 mt-0.5 space-y-0.5 border-l border-line pl-2">
                  <button
                    onClick={() => props.onNewChat(p.id)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs font-medium text-accent transition hover:bg-accent-soft"
                  >
                    <Plus size={13} />
                    {t.newChatInProject}
                  </button>
                  {projChats.map(renderChat)}
                  {projChats.length === 0 && !q && (
                    <div className="px-3 py-1.5 text-xs text-muted">{t.noChatsYet}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Recents */}
        <div className={labelCls}>{t.recents}</div>
        {loose.length > 0 ? (
          <div className="space-y-0.5">{loose.map(renderChat)}</div>
        ) : (
          <div className="px-3 py-2 text-sm text-muted">
            {q && visibleProjects.length === 0 ? t.noResults : q ? "" : t.noChatsYet}
          </div>
        )}
      </div>

      {/* Mobile quick settings */}
      <div className="flex items-center gap-1 px-3 pb-2 sm:hidden">
        <LanguageMenu placement="up" align="left" />
        <button
          onClick={props.onToggleTheme}
          className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium transition hover:bg-surface2"
        >
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          {theme === "light" ? t.darkMode : t.lightMode}
        </button>
      </div>

      {/* Profile */}
      <div className="border-t border-line p-2.5">
        {profile ? (
          <div ref={userRef} className="relative">
            <button
              onClick={() => setUserMenu((v) => !v)}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-surface2"
            >
              <Avatar profile={profile} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{profile.name}</div>
                <div className="truncate text-xs text-muted">{profile.email}</div>
              </div>
            </button>

            {userMenu && (
              <div className="animate-pop absolute bottom-full left-0 right-0 z-30 mb-2 rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
                <MenuItem
                  icon={Pencil}
                  label={t.editProfile}
                  onClick={() => {
                    setUserMenu(false);
                    props.onEditProfile();
                  }}
                />
                <MenuItem
                  icon={theme === "light" ? Moon : Sun}
                  label={theme === "light" ? t.darkMode : t.lightMode}
                  onClick={() => {
                    props.onToggleTheme();
                  }}
                />
                <div className="my-1 h-px bg-line" />
                <MenuItem
                  icon={LogOut}
                  label={t.signOut}
                  danger
                  onClick={() => {
                    setUserMenu(false);
                    props.onSignOut();
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="px-1 pb-2.5 text-xs leading-relaxed text-muted">{t.guestLine}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => props.onLogin("login")}
                className="h-10 rounded-xl border border-line bg-surface text-sm font-semibold transition hover:bg-surface2"
              >
                {t.logIn}
              </button>
              <button
                onClick={() => props.onLogin("signup")}
                className="h-10 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                {t.signUp}
              </button>
            </div>
          </div>
        )}
      </div>

      {menuNode}
    </aside>
  );
}
/* ================= Header profile ================= */
function HeaderProfile({
  profile,
  theme,
  onEditProfile,
  onToggleTheme,
  onSignOut,
}: {
  profile: Profile;
  theme: "light" | "dark";
  onEditProfile: () => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutside(ref, () => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile"
        title={profile.name}
        className={
          "flex h-9 w-9 items-center justify-center rounded-full ring-2 transition hover:ring-accent/60 " +
          (open ? "ring-accent" : "ring-transparent")
        }
      >
        <Avatar profile={profile} size={34} />
      </button>

      {open && (
        <div className="animate-pop absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar profile={profile} size={40} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{profile.name}</div>
              <div className="truncate text-xs text-muted">{profile.email}</div>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          <MenuItem
            icon={Pencil}
            label={t.editProfile}
            onClick={() => {
              setOpen(false);
              onEditProfile();
            }}
          />
          <MenuItem
            icon={theme === "light" ? Moon : Sun}
            label={theme === "light" ? t.darkMode : t.lightMode}
            onClick={onToggleTheme}
          />
          <div className="my-1 h-px bg-line" />
          <MenuItem
            icon={LogOut}
            label={t.signOut}
            danger
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          />
        </div>
      )}
    </div>
  );
}
/* ================= Main component ================= */
type ChipKey =
  | "chipWrite"
  | "chipLearn"
  | "chipImage"
  | "chipSummary"
  | "chipCode"
  | "chipIdeas"
  | "chipTranslate"
  | "chipExplain";
type ChipDef = { key: ChipKey; icon: IconType; action: "fill" | "upload" };

const MAIN_CHIPS: ChipDef[] = [
  { key: "chipWrite", icon: PenLine, action: "fill" },
  { key: "chipLearn", icon: BookOpen, action: "fill" },
  { key: "chipImage", icon: ImageIcon, action: "upload" },
  { key: "chipSummary", icon: AlignLeft, action: "fill" },
];

const EXTRA_CHIPS: ChipDef[] = [
  { key: "chipCode", icon: Code, action: "fill" },
  { key: "chipIdeas", icon: Lightbulb, action: "fill" },
  { key: "chipTranslate", icon: Languages, action: "fill" },
  { key: "chipExplain", icon: Sparkles, action: "fill" },
];

const SPEECH_LANG: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-BR",
  ja: "ja-JP",
  zh: "zh-CN",
  ru: "ru-RU",
};

export default function Chat() {
  const { t, lang } = useT();

  const [chats, setChats] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [loadedFor, setLoadedFor] = useState("");

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [greetKey, setGreetKey] = useState<"greetMorning" | "greetAfternoon" | "greetEvening">("greetMorning");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loginMode, setLoginMode] = useState<"login" | "signup" | null>(null);
  const [loginNotice, setLoginNotice] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [projectModal, setProjectModal] = useState<{ id: string | null } | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    body: string;
    label: string;
    onConfirm: () => void;
  } | null>(null);

  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mode, setMode] = useState<ModeId>("friendly");
  const [modeOpen, setModeOpen] = useState(false);
  const [moreChips, setMoreChips] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const [showJump, setShowJump] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const modeRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const micToken = useRef(0);
  const baseRef = useRef("");
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});

  useOutside(modeRef, () => setModeOpen(false), modeOpen);

  const userKey = profile ? profile.email.toLowerCase() : "guest";
  const activeChat = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId]);
  const messages = activeChat ? activeChat.messages : EMPTY_MESSAGES;
  const loading = loadingId !== null && loadingId === activeId;
  const busy = loadingId !== null;
  const currentProjectId = activeChat ? (activeChat.projectId ?? null) : draftProjectId;
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;

  const updateChat = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  /* ----- init ----- */
  useEffect(() => {
    const h = new Date().getHours();
    setGreetKey(h < 12 ? "greetMorning" : h < 17 ? "greetAfternoon" : "greetEvening");
    setProfile(loadProfile());
    let stored = "open";
    try {
      const th = localStorage.getItem("convoai-theme-v2");
      setTheme(th === "light" ? "light" : "dark");
      const m = localStorage.getItem("convoai-mode");
      if (MODES.some((x) => x.id === m)) setMode(m as ModeId);
      stored = localStorage.getItem("convoai-sidebar") || "open";
    } catch {
      /* ignore */
    }
    const w = window as unknown as Record<string, unknown>;
    setSpeechOk(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));

    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    setSidebarOpen(mq.matches ? stored !== "closed" : false);
    const onChange = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      setSidebarOpen(e.matches ? stored !== "closed" : false);
    };
    mq.addEventListener("change", onChange);

    setBooted(true);
    return () => {
      mq.removeEventListener("change", onChange);
      micToken.current += 1;
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // User badalne par uska data load karo
  useEffect(() => {
    if (!booted) return;
    const s = loadStore(userKey);
    setChats(s.chats);
    setProjects(s.projects);
    setActiveId(null);
    setDraftProjectId(null);
    setLoadedFor(userKey);
  }, [booted, userKey]);

  // Data badalne par save karo
  useEffect(() => {
    if (!booted || loadedFor !== userKey) return;
    saveStore(userKey, chats, projects);
  }, [chats, projects, loadedFor, userKey, booted]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, activeId]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(Math.max(el.scrollHeight, 56), 180) + "px";
  }, [input, messages.length]);

  useEffect(() => {
    if (input || listening) return;
    const timer = setInterval(() => setHintIdx((i) => i + 1), 3200);
    return () => clearInterval(timer);
  }, [input, listening]);

  // Latest sendMessage ko ref mein rakho (login ke baad auto-send ke liye)
  useEffect(() => {
    sendRef.current = sendMessage;
  });

  // Login ke baad pending message apne-aap bhejo
  useEffect(() => {
    if (!pendingSend || !profile || !booted || loadedFor !== userKey) return;
    setPendingSend(false);
    void sendRef.current(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSend, profile, booted, loadedFor, userKey]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 160);
  }

  /* ----- sidebar / theme / mode ----- */
  function toggleSidebar() {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    if (isDesktop) {
      try {
        localStorage.setItem("convoai-sidebar", next ? "open" : "closed");
      } catch {
        /* ignore */
      }
    }
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("convoai-theme-v2", next);
    } catch {
      /* ignore */
    }
  }

  function chooseMode(id: ModeId) {
    setMode(id);
    setModeOpen(false);
    try {
      localStorage.setItem("convoai-mode", id);
    } catch {
      /* ignore */
    }
  }

  /* ----- auth / profile ----- */
  function persistProfile(p: Profile) {
    try {
      localStorage.setItem("convoai-profile", JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }

  function handleAuth(p: Profile) {
    const full: Profile = { ...p, about: p.about || readAbout(p.email) };
    setProfile(full);
    persistProfile(full);
    setLoginMode(null);
    setLoginNotice(false);
  }

  function closeLogin() {
    setLoginMode(null);
    setLoginNotice(false);
    setPendingSend(false);
  }

  function saveProfileEdit(name: string, about: string) {
    if (!profile) return;
    const next: Profile = { ...profile, name, about };
    setProfile(next);
    persistProfile(next);
    writeAbout(next.email, about);
    setProfileOpen(false);
  }

  function signOut() {
    killMic();
    setPendingSend(false);
    setProfile(null);
    setProfileOpen(false);
    try {
      localStorage.removeItem("convoai-profile");
    } catch {
      /* ignore */
    }
  }

  /* ----- chats and projects ----- */
  function newChat(projectId?: string) {
    killMic();
    setActiveId(null);
    setDraftProjectId(projectId ?? null);
    setAttachments([]);
    setError("");
    setInput("");
    if (!isDesktop) setSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 80);
  }

  function selectChat(id: string) {
    setActiveId(id);
    setDraftProjectId(null);
    setError("");
    if (!isDesktop) setSidebarOpen(false);
  }

  function renameChat(id: string, title: string) {
    updateChat(id, (c) => ({ ...c, title: title.trim().slice(0, 80) || c.title }));
  }

  function askDeleteChat(id: string) {
    const c = chats.find((x) => x.id === id);
    if (!c) return;
    setConfirmState({
      title: "Delete chat?",
      body: '"' + c.title + '" will be permanently deleted.',
      label: "Delete",
      onConfirm: () => {
        setChats((prev) => prev.filter((x) => x.id !== id));
        setActiveId((cur) => (cur === id ? null : cur));
      },
    });
  }

  function moveChat(id: string, projectId: string | null) {
    updateChat(id, (c) => ({ ...c, projectId: projectId ?? undefined }));
  }

  function saveProject(name: string, instructions: string) {
    if (!projectModal) return;
    if (projectModal.id) {
      const id = projectModal.id;
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name, instructions } : p)));
      setProjectModal(null);
    } else {
      const p: Project = { id: makeId(), name, instructions, createdAt: Date.now() };
      setProjects((prev) => [p, ...prev]);
      setProjectModal(null);
      newChat(p.id);
    }
  }

  function renameProject(id: string, name: string) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name: name.slice(0, 60) } : p)));
  }

  function askDeleteProject(id: string) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    setConfirmState({
      title: "Delete project?",
      body: 'The project "' + p.name + '" will be deleted. Its chats are kept and moved to Recents.',
      label: "Delete project",
      onConfirm: () => {
        setProjects((prev) => prev.filter((x) => x.id !== id));
        setChats((prev) => prev.map((c) => (c.projectId === id ? { ...c, projectId: undefined } : c)));
        setDraftProjectId((cur) => (cur === id ? null : cur));
      },
    });
  }

  /* ----- voice input ----- */
  function killMic() {
    micToken.current += 1;
    const r = recRef.current;
    recRef.current = null;
    if (r) {
      r.onresult = null;
      r.onend = null;
      r.onerror = null;
      try {
        r.abort();
      } catch {
        /* ignore */
      }
    }
    setListening(false);
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Voice input is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    const token = ++micToken.current;
    const rec = new Ctor();
    rec.lang = SPEECH_LANG[lang] ?? "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    baseRef.current = input ? input.trimEnd() + " " : "";
    rec.onresult = (e) => {
      if (token !== micToken.current) return;
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput(baseRef.current + text);
    };
    rec.onerror = () => {
      if (token !== micToken.current) return;
      setListening(false);
      setError("Could not access the microphone. Please allow mic access in your browser.");
    };
    rec.onend = () => {
      if (token === micToken.current) setListening(false);
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  /* ----- files ----- */
  async function addFiles(files: File[]) {
    if (!files.length) return;
    const room = MAX_FILES - attachments.length;
    if (room <= 0) {
      setError("You can attach up to " + MAX_FILES + " files per message.");
      return;
    }
    const errs: string[] = [];
    if (files.length > room) errs.push("Only " + room + " more file(s) can be added.");

    const added: Attachment[] = [];
    for (const f of files.slice(0, room)) {
      try {
        added.push(await processFile(f));
      } catch (e) {
        errs.push(e instanceof Error ? e.message : "Could not add the file");
      }
    }
    if (added.length) setAttachments((prev) => [...prev, ...added].slice(0, MAX_FILES));
    setError(errs.join(" "));
  }

  function handleDragEnter(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current += 1;
    setDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }
  function handlePaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  /* ----- send / regenerate ----- */
  async function requestReply(
    chatId: string,
    history: Message[],
    projectId: string | null,
    onFail: () => void
  ) {
    setError("");
    setLoadingId(chatId);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          profile: profile ? { name: profile.name, about: profile.about } : undefined,
          project: projectPayload(projects, projectId),
          messages: history.map((m) => {
            const withData = (m.attachments ?? []).filter((a) => a.data);
            const lost = (m.attachments ?? []).filter((a) => !a.data);
            let content = m.content;
            if (!content && lost.length > 0 && withData.length === 0) {
              content = "[Earlier attachment is no longer available: " + lost.map((a) => a.name).join(", ") + "]";
            }
            return {
              role: m.role,
              content,
              attachments: withData.map((a) => ({
                name: a.name,
                mimeType: a.mimeType,
                kind: a.kind,
                data: a.data,
              })),
            };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      updateChat(chatId, (c) => ({
        ...c,
        messages: [...history, { role: "assistant", content: data.reply }],
        updatedAt: Date.now(),
      }));
    } catch (err) {
      onFail();
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoadingId(null);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || busy) return;

    // Login zaroori hai: message input mein bacha rehta hai, login ke baad auto-send hoga
    if (!profile) {
      killMic();
      setInput(trimmed);
      setPendingSend(true);
      setLoginNotice(true);
      setLoginMode("login");
      return;
    }

    killMic();

    const sent = attachments;
    const userMsg: Message = {
      role: "user",
      content: trimmed,
      attachments: sent.length ? sent : undefined,
    };
    const now = Date.now();

    let cid: string;
    let history: Message[];
    let created = false;
    const projectId = currentProjectId;
    const previousMessages = activeChat ? activeChat.messages : EMPTY_MESSAGES;

    if (activeChat) {
      cid = activeChat.id;
      history = [...activeChat.messages, userMsg];
      updateChat(cid, (c) => ({ ...c, messages: history, updatedAt: now }));
    } else {
      cid = makeId();
      created = true;
      history = [userMsg];
      const conv: Conversation = {
        id: cid,
        title: makeTitle(trimmed, sent),
        projectId: projectId ?? undefined,
        messages: history,
        createdAt: now,
        updatedAt: now,
      };
      setChats((prev) => [conv, ...prev]);
      setActiveId(cid);
      setDraftProjectId(null);
    }

    setInput("");
    setAttachments([]);

    await requestReply(cid, history, projectId, () => {
      if (created) {
        setChats((prev) => prev.filter((c) => c.id !== cid));
        setActiveId((cur) => (cur === cid ? null : cur));
        setDraftProjectId(projectId);
      } else {
        updateChat(cid, (c) => ({ ...c, messages: previousMessages }));
      }
      setInput(trimmed);
      setAttachments(sent);
    });
  }

  async function regenerate() {
    if (busy || !activeChat) return;
    const full = activeChat.messages;
    if (full.length < 2 || full[full.length - 1].role !== "assistant") return;
    const cid = activeChat.id;
    const history = full.slice(0, -1);
    updateChat(cid, (c) => ({ ...c, messages: history }));
    await requestReply(cid, history, activeChat.projectId ?? null, () =>
      updateChat(cid, (c) => ({ ...c, messages: full }))
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleChip(c: ChipDef) {
    if (c.action === "upload") {
      fileRef.current?.click();
      return;
    }
    const label = t[c.key];
    setInput(c.key === "chipSummary" ? label + ":\n\n" : label + " ");
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  }

  const canSend = !busy && (input.trim().length > 0 || attachments.length > 0);
  const isEmpty = messages.length === 0;
  const currentMode = MODES.find((m) => m.id === mode) ?? MODES[0];
  const ModeIcon = currentMode.icon;
  const firstName = profile?.name.trim().split(/\s+/)[0];
  const sidebarVisible = isDesktop && sidebarOpen;
  const shareChat = chats.find((c) => c.id === shareId) ?? null;
  const editingProject = projectModal?.id ? (projects.find((p) => p.id === projectModal.id) ?? null) : null;
  const hint = t.hints[hintIdx % t.hints.length];

  /* ================= Composer ================= */
  const renderComposer = () => (
    <div className="w-full">
      {error && (
        <div className="animate-fade-up mb-3 flex items-start justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {!activeChat && currentProject && (
        <div className="animate-pop mb-2 flex w-fit items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-xs font-medium">
          <Folder size={13} className="text-accent" />
          {currentProject.name}
          <button
            onClick={() => setDraftProjectId(null)}
            aria-label="Remove project"
            className="rounded-full p-0.5 text-muted transition hover:text-ink"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="rounded-[28px] border border-line bg-surface shadow-soft transition focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-4">
            {attachments.map((a) => (
              <div key={a.id} className="group relative">
                {a.kind === "image" && a.data ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageSrc(a)} alt={a.name} className="h-16 w-16 rounded-xl border border-line object-cover" />
                ) : (
                  <div className="flex h-16 items-center gap-2 rounded-xl border border-line bg-surface2 px-3">
                    <FileText size={18} className="shrink-0 text-accent" />
                    <span className="max-w-[140px] truncate text-xs">{a.name}</span>
                  </div>
                )}
                <button
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  aria-label="Remove file"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-app transition hover:bg-red-500 hover:text-white"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={2}
          placeholder={listening ? t.listening : hint}
          className="block max-h-[180px] w-full resize-none bg-transparent px-5 pb-1 pt-4 text-[14px] text-ink outline-none placeholder:text-muted"
        />

        <div className="flex items-center justify-between px-3 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                addFiles(files);
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Attach file"
              title="Attach an image, PDF or file"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink transition hover:bg-surface2"
            >
              <Plus size={19} />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <div ref={modeRef} className="relative">
              <button
                onClick={() => setModeOpen((v) => !v)}
                className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition hover:bg-surface2"
              >
                <ModeIcon size={16} className="text-accent" />
                <span className="hidden sm:inline">{currentMode.label}</span>
                <ChevronDown size={14} className={"text-muted transition " + (modeOpen ? "rotate-180" : "")} />
              </button>
              {modeOpen && (
                <div className="animate-pop absolute bottom-full right-0 z-30 mb-2 w-72 rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
                  {MODES.map((m) => {
                    const Icon = m.icon;
                    const active = m.id === mode;
                    return (
                      <button
                        key={m.id}
                        onClick={() => chooseMode(m.id)}
                        className={
                          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface2 " +
                          (active ? "bg-accent-soft" : "")
                        }
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface2 text-accent">
                          <Icon size={17} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">{m.label}</div>
                          <div className="truncate text-xs text-muted">{m.desc}</div>
                        </div>
                        {active && <Check size={16} className="text-accent" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {speechOk && (
              <button
                onClick={toggleMic}
                aria-label="Voice input"
                title={listening ? "Click to stop" : "Speak to type"}
                className={
                  "flex h-10 w-10 items-center justify-center rounded-full transition " +
                  (listening ? "animate-ring bg-red-500 text-white" : "text-ink hover:bg-surface2")
                }
              >
                <Mic size={19} />
              </button>
            )}

            <button
              onClick={() => sendMessage(input)}
              disabled={!canSend}
              aria-label="Send"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-fg transition hover:scale-105 hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-muted disabled:hover:scale-100"
            >
              <ArrowUp size={19} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ================= Sidebar element ================= */
  const sidebarEl = (
    <Sidebar
      chats={chats}
      projects={projects}
      activeId={activeId}
      activeProjectId={currentProjectId}
      profile={profile}
      theme={theme}
      onClose={toggleSidebar}
      onNewChat={newChat}
      onSelect={selectChat}
      onRenameChat={renameChat}
      onDeleteChat={askDeleteChat}
      onMoveChat={moveChat}
      onShare={(id) => setShareId(id)}
      onNewProject={() => setProjectModal({ id: null })}
      onEditProject={(id) => setProjectModal({ id })}
      onRenameProject={renameProject}
      onDeleteProject={askDeleteProject}
      onLogin={(m) => {
        if (!isDesktop) setSidebarOpen(false);
        setLoginNotice(false);
        setLoginMode(m);
      }}
      onEditProfile={() => setProfileOpen(true)}
      onSignOut={signOut}
      onToggleTheme={toggleTheme}
    />
  );

  /* ================= Render ================= */
  return (
    <div
      className="relative isolate flex h-dvh overflow-hidden bg-app text-ink"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="blob blob-1 -left-20 -top-24 h-[26rem] w-[26rem]" />
        <div className="blob blob-2 -right-24 top-1/3 h-[24rem] w-[24rem]" />
        <div className="blob blob-3 -bottom-32 left-1/4 h-[24rem] w-[24rem]" />
        <div className="bg-grid absolute inset-0" />
      </div>

      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-app/80 backdrop-blur-sm">
          <div className="animate-scale-in flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent/70 bg-surface px-16 py-12 shadow-lift">
            <UploadCloud size={46} className="text-accent" />
            <p className="text-lg font-semibold">Drop your files here</p>
            <p className="text-sm text-muted">Images, PDFs or text and code files</p>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Preview" className="animate-scale-in max-h-full max-w-full rounded-xl shadow-2xl" />
        </div>
      )}

      {/* Modals */}
      {loginMode && (
        <LoginModal
          key={loginMode + (loginNotice ? "-n" : "")}
          initialMode={loginMode}
          notice={loginNotice}
          onAuth={handleAuth}
          onClose={closeLogin}
        />
      )}
      {profileOpen && profile && (
        <ProfileModal
          profile={profile}
          onSave={saveProfileEdit}
          onSignOut={signOut}
          onClose={() => setProfileOpen(false)}
        />
      )}
      {projectModal && (
        <ProjectModal
          key={projectModal.id ?? "new"}
          existing={editingProject}
          onSave={saveProject}
          onClose={() => setProjectModal(null)}
        />
      )}
      {shareChat && <ShareModal chat={shareChat} onClose={() => setShareId(null)} />}
      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          body={confirmState.body}
          confirmLabel={confirmState.label}
          onConfirm={confirmState.onConfirm}
          onClose={() => setConfirmState(null)}
        />
      )}

      {/* Sidebar */}
      {isDesktop ? (
        <div
          className="relative z-20 shrink-0 overflow-hidden transition-[width] duration-300"
          style={{ width: sidebarOpen ? 288 : 0 }}
        >
          {sidebarEl}
        </div>
      ) : (
        <>
          {sidebarOpen && (
            <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px]" onClick={() => setSidebarOpen(false)} />
          )}
          <div
            className={
              "fixed inset-y-0 left-0 z-40 transition-transform duration-300 " +
              (sidebarOpen ? "translate-x-0" : "-translate-x-full")
            }
          >
            {sidebarEl}
          </div>
        </>
      )}

      {/* Main column */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="relative z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line/60 bg-app/70 px-3 backdrop-blur-md sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            {!sidebarVisible && (
              <button
                onClick={toggleSidebar}
                aria-label="Open sidebar"
                title="Open sidebar"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface2 hover:text-ink"
              >
                <Menu size={20} />
              </button>
            )}
            <span className="flex h-9 items-center sm:hidden"><Wordmark size={18} /></span>
            {activeChat ? (
              <div className="hidden min-w-0 leading-tight sm:block">
                {currentProject && (
                  <div className="flex items-center gap-1 truncate text-[11px] font-medium text-muted">
                    <Folder size={11} />
                    {currentProject.name}
                  </div>
                )}
                <div className="truncate text-sm font-semibold">{activeChat.title}</div>
              </div>
            ) : (
              !sidebarVisible && (
                <span className="hidden sm:inline-flex">
                  <Wordmark size={18} />
                </span>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => activeChat && setShareId(activeChat.id)}
              disabled={!activeChat}
              title={activeChat ? t.share : t.shareHint}
              className={
                "h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium transition hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent " +
                (activeChat ? "flex" : "hidden sm:flex")
              }
            >
              <Share size={17} />
              <span className="hidden sm:inline">{t.share}</span>
            </button>
            <div className="hidden sm:block">
              <LanguageMenu compact />
            </div>
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title={theme === "light" ? t.darkMode : t.lightMode}
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface shadow-sm transition hover:bg-surface2"
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            {profile && (
              <HeaderProfile
                profile={profile}
                theme={theme}
                onEditProfile={() => setProfileOpen(true)}
                onToggleTheme={toggleTheme}
                onSignOut={signOut}
              />
            )}
            {!profile && (
              <button
                onClick={() => {
                  setLoginNotice(false);
                  setLoginMode("login");
                }}
                className="h-9 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:brightness-110 sm:px-5"
              >
                {t.logIn}
              </button>
            )}
          </div>
        </header>

        {isEmpty ? (
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col items-center justify-center px-4 py-8 text-center">
              <div className="animate-fade-up relative">
                <div className="absolute inset-0 rounded-full bg-accent/25 blur-3xl" />
                <div className="animate-bob relative">
                  <span className="sm:hidden">
                    <Wordmark size={26} />
                  </span>
                  <span className="hidden sm:inline">
                    <Wordmark size={34} />
                  </span>
                </div>
              </div>

              {firstName && (
                <div className="animate-fade-up delay-1 mt-6 rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-muted shadow-sm">
                  {t[greetKey]}, <span className="font-semibold text-ink">{firstName}</span>
                </div>
              )}

              <h1 className={"animate-fade-up delay-1 text-4xl font-bold sm:text-5xl " + (firstName ? "mt-4" : "mt-8")}>
                {rich(t.heroTitle, {}, (s) => (
                  <span className="gradient-text">{s}</span>
                ))}
              </h1>
              <p className="animate-fade-up delay-2 mt-3 text-sm text-muted">{t.heroSub}</p>

              <div className="animate-fade-up delay-2 mt-8 w-full text-left">{renderComposer()}</div>

              <div className="animate-fade-up delay-3 mt-5 flex flex-wrap justify-center gap-2.5">
                {MAIN_CHIPS.map((c) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.key}
                      onClick={() => handleChip(c)}
                      className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent-soft hover:shadow-soft"
                    >
                      <Icon size={16} className="text-accent" />
                      {t[c.key]}
                    </button>
                  );
                })}
                {!moreChips && (
                  <button
                    onClick={() => setMoreChips(true)}
                    className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:bg-surface2"
                  >
                    <Plus size={16} className="text-muted" />
                    {t.chipMore}
                  </button>
                )}
                {moreChips &&
                  EXTRA_CHIPS.map((c) => {
                    const Icon = c.icon;
                    return (
                      <button
                        key={c.key}
                        onClick={() => handleChip(c)}
                        className="animate-pop flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent-soft hover:shadow-soft"
                      >
                        <Icon size={16} className="text-accent" />
                        {t[c.key]}
                      </button>
                    );
                  })}
              </div>
            </div>
            <SiteFooter />
          </main>
        ) : (
          <>
            <div className="relative flex min-h-0 flex-1 flex-col">
              <main ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                <div className="mx-auto flex max-w-3xl flex-col gap-8">
                  {messages.map((m, i) => {
                    if (m.role === "user") {
                      return (
                        <div key={i} className="animate-fade-up flex flex-col items-end gap-2">
                          {m.attachments && m.attachments.length > 0 && (
                            <div className="flex flex-wrap justify-end gap-2">
                              {m.attachments.map((a) =>
                                a.kind === "image" && a.data ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    key={a.id}
                                    src={imageSrc(a)}
                                    alt={a.name}
                                    onClick={() => setLightbox(imageSrc(a))}
                                    className="max-h-52 max-w-full cursor-zoom-in rounded-2xl border border-line object-cover shadow-soft transition hover:scale-[1.02]"
                                  />
                                ) : (
                                  <div key={a.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-sm">
                                    <FileText size={16} className="text-accent" />
                                    <span className="max-w-[200px] truncate">{a.name}</span>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                          {m.content && (
                            <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-user px-4 py-2.5 text-[14px] leading-relaxed text-user-fg shadow-sm">
                              <p className="whitespace-pre-wrap break-words">{m.content}</p>
                            </div>
                          )}
                        </div>
                      );
                    }

                    const isLast = i === messages.length - 1;
                    return (
                      <div key={i} className="animate-fade-up flex gap-3.5">
                        <div className="mt-0.5">
                          <LogoMark size={30} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 text-xs font-semibold text-muted">ConvoAI</div>
                          <div className="text-[14px] leading-7">
                            <Markdown content={m.content} />
                          </div>
                          <div className="-ml-1.5 mt-1 flex items-center gap-1">
                            <CopyButton text={m.content} label />
                            {isLast && !loading && (
                              <button
                                onClick={regenerate}
                                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted transition hover:bg-surface2 hover:text-ink"
                              >
                                <RotateCcw size={13} />
                                Regenerate
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {loading && (
                    <div className="animate-fade-up flex gap-3.5">
                      <div className="mt-0.5">
                        <LogoMark size={30} />
                      </div>
                      <div className="flex items-center gap-3 pt-1">
                        <div className="flex items-center gap-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-accent" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>
              </main>

              {showJump && (
                <button
                  onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
                  aria-label="Scroll to latest"
                  className="animate-pop absolute bottom-3 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface shadow-lift transition hover:bg-surface2"
                >
                  <ArrowDown size={17} />
                </button>
              )}
            </div>

            <div className="px-4 pb-4 pt-2 sm:px-6">
              <div className="mx-auto max-w-3xl">{renderComposer()}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}