"use client";

import { useEffect, useState } from "react";

// Loading screen kam se kam itni der dikhegi (milliseconds)
const MIN_MS = 1200;

export default function Splash() {
  const [phase, setPhase] = useState<"show" | "hide" | "gone">("show");

  useEffect(() => {
    const start = Date.now();
    const timers: number[] = [];
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      const wait = Math.max(0, MIN_MS - (Date.now() - start));
      timers.push(
        window.setTimeout(() => {
          setPhase("hide");
          timers.push(window.setTimeout(() => setPhase("gone"), 500));
        }, wait)
      );
    };

    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish);
    timers.push(window.setTimeout(finish, 3500));

    return () => {
      window.removeEventListener("load", finish);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  if (phase === "gone") return null;

  const hiding = phase === "hide";

  return (
    <div
      role="status"
      aria-label="Loading ConvoAI"
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: "var(--bg)",
        opacity: hiding ? 0 : 1,
        transition: "opacity 0.5s ease",
        pointerEvents: hiding ? "none" : "auto",
      }}
    >
      <div className="absolute h-64 w-64 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative flex flex-col items-center">
        <div className="relative h-20 w-20">
          <svg
            className="absolute inset-0 h-full w-full animate-spin"
            style={{ animationDuration: "1.3s" }}
            viewBox="0 0 100 100"
            fill="none"
          >
            <defs>
              <linearGradient id="splash-ring" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0ea5e9" />
                <stop offset="1" stopColor="#2563eb" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="45" strokeWidth="4" style={{ stroke: "var(--border)" }} />
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="url(#splash-ring)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="80 203"
            />
          </svg>
          <svg
            className="absolute inset-0 h-full w-full animate-spin"
            style={{ animationDuration: "2.1s", animationDirection: "reverse" }}
            viewBox="0 0 100 100"
            fill="none"
          >
            <circle
              cx="50"
              cy="50"
              r="36"
              stroke="#38bdf8"
              strokeOpacity="0.55"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="30 196"
            />
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="splash-logo" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#0ea5e9" />
                  <stop offset="1" stopColor="#2563eb" />
                </linearGradient>
              </defs>
              <rect x="2" y="2" width="44" height="38" rx="14" fill="url(#splash-logo)" />
              <path d="M9 36 L7 46 L19 39 Z" fill="url(#splash-logo)" />
              <path d="M31.3 14.9 A9.5 9.5 0 1 0 31.3 27.1" stroke="#ffffff" strokeWidth="4.2" strokeLinecap="round" />
              <circle cx="32.6" cy="21" r="2.4" fill="#ffffff" />
            </svg>
          </div>
        </div>

        <div className="font-display mt-4 text-2xl font-extrabold" style={{ color: "var(--text)" }}>
          Convo<span className="gradient-text">AI</span>
        </div>

        <div className="mt-4 h-1 w-32 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
          <div className="splash-bar h-full w-1/3 rounded-full bg-gradient-to-r from-sky-500 to-blue-600" />
        </div>
      </div>
    </div>
  );
}