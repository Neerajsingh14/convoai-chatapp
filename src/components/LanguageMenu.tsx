"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { LANGS, useT } from "@/lib/i18n";

export default function LanguageMenu({
  placement = "down",
  align = "right",
  compact = false,
}: {
  placement?: "up" | "down";
  align?: "left" | "right";
  compact?: boolean;
}) {
  const { lang, setLang, t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t.language}
        title={t.language}
        className={
          compact
            ? "flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface shadow-sm transition hover:bg-surface2"
            : "flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium transition hover:bg-surface2"
        }
      >
        <Languages size={compact ? 16 : 18} />
        {!compact && (
          <>
            {current.native}
            <ChevronDown size={14} className={"text-muted transition " + (open ? "rotate-180" : "")} />
          </>
        )}
      </button>

      {open && (
        <div
          className={
            "animate-pop absolute z-50 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-lift " +
            (align === "left" ? "left-0 " : "right-0 ") +
            (placement === "up" ? "bottom-full mb-2" : "top-full mt-2")
          }
        >
          <div className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            {t.language}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {LANGS.map((l) => {
              const active = l.code === lang;
              return (
                <button
                  key={l.code}
                  onClick={() => {
                    setLang(l.code);
                    setOpen(false);
                  }}
                  className={
                    "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface2 " +
                    (active ? "bg-accent-soft font-semibold" : "")
                  }
                >
                  <span>
                    {l.native}
                    <span className="ml-2 text-xs font-normal text-muted">{l.name}</span>
                  </span>
                  {active && <Check size={15} className="text-accent" />}
                </button>
              );
            })}
          </div>
          <p className="px-3 pb-2 pt-1.5 text-xs leading-relaxed text-muted">{t.fLangNote}</p>
        </div>
      )}
    </div>
  );
}