import type { Metadata, Viewport } from "next";
import { Poppins, Outfit } from "next/font/google";
import "./globals.css";
import Splash from "@/components/Splash";
import { LangProvider } from "@/lib/i18n";

const poppins = Poppins({
  variable: "--font-body",
  subsets: ["latin", "latin-ext", "devanagari"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ConvoAI",
  description: "Your friendly AI chat companion",
};

export const viewport: Viewport = {
  themeColor: "#0b0e13",
};

// Page paint hone se pehle theme set karta hai (default = dark), taaki flash na ho
const themeScript =
  "(function(){var t='dark';try{t=localStorage.getItem('convoai-theme-v2')||'dark'}catch(e){}document.documentElement.setAttribute('data-theme',t)})()";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={poppins.variable + " " + outfit.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <LangProvider>
          <Splash />
          {children}
        </LangProvider>
      </body>
    </html>
  );
}