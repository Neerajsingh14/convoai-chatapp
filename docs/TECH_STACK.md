# Tech Stack

Everything used to build ConvoAI, and why.

## At a glance

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI library | React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + CSS variables for themes |
| Icons | lucide-react |
| Markdown | react-markdown + remark-gfm |
| Fonts | Poppins (body) and Outfit (headings), via next/font |
| AI model | Google Gemini API (REST) |
| Login | Google Identity Services + local email/password |
| Storage | Browser localStorage |
| Hosting | Vercel (optional) |

## Frontend

- **Next.js (App Router)** - one project for both the frontend and the backend. Pages are in `src/app`, and the server code lives in a route handler.
- **React** - the whole interface is built from components. State is managed with hooks (`useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`) and React Context for translations.
- **TypeScript** - type safety for messages, chats, projects, profiles and API payloads.
- **Tailwind CSS v4** - utility classes for layout and styling. Colors are CSS variables (`--bg`, `--surface`, `--accent` and so on), so the dark and light themes switch by changing one `data-theme` attribute.
- **next/font** - self-hosts Poppins and Outfit (including Devanagari for Hindi), so there is no layout shift and no external font request at runtime.
- **lucide-react** - consistent line icons.
- **react-markdown and remark-gfm** - render the AI's Markdown answers (lists, tables, code blocks, links).
- **Custom CSS animations** - aurora background blobs, fade and pop transitions, gradient text, the loading screen and the voice recording pulse. They respect `prefers-reduced-motion`.

## Backend

- **Next.js Route Handler** (`src/app/api/chat/route.ts`) - a server-side endpoint. The browser sends the conversation to this route, and the route calls the Gemini API. This keeps the API key on the server and never in the browser.
- **Google Gemini REST API** - called with `fetch` (`generateContent`), so no extra SDK is needed. Supports text, images and PDFs as inline data.
- **System prompt builder** - combines the base instructions, the selected chat mode, the user's name and "about" text, the active project's instructions, and a language rule.
- **Language matching** - the system prompt tells the model to reply in the language and script of the user's latest message (English, Devanagari Hindi, Hinglish and others).
- **Model fallback and retry** - if one Gemini model is busy (503), rate limited (429) or retired (404), the route retries and moves on to the next model in the list. The list starts with the optional `GEMINI_MODEL` value.

## Authentication

- **Google sign-in** - Google Identity Services (OAuth 2.0 token client, popup flow). After consent, the app reads the name, email and photo from Google's userinfo endpoint.
- **Email and password** - accounts are created in the browser. Passwords are hashed with PBKDF2 (SHA-256, 150,000 iterations, random salt) using the Web Crypto API. The plain password is never stored or sent anywhere.
- **Login gate** - sending a message without logging in opens the login window. The typed message is kept and sent automatically right after login.

## Data and storage

- **localStorage** stores profiles, chats, projects, theme, chat mode, interface language and sidebar state. Chat data is saved per user.
- **Storage safety** - saved chats keep only file names (not the file contents), and the app falls back to fewer chats if the storage quota is reached.
- **Import validation** - saved data is checked and cleaned when it is loaded.

## Browser APIs

| API | Used for |
| --- | --- |
| Web Speech API (SpeechRecognition) | Voice input, with a language that follows the interface language |
| Web Crypto API | Password hashing |
| FileReader and Canvas | Reading attachments and compressing large images before upload |
| Drag and Drop and Clipboard | Dropping files and pasting screenshots |
| Clipboard API | Copy buttons |
| Web Share API | "Share with other apps" on supported devices |
| matchMedia | Switching between desktop sidebar and mobile drawer |

## Features and how they work

- **File upload** - up to 4 files per message. Images are resized (max 1600 px) and converted to JPEG, PDFs up to 6 MB, text and code files up to 200 KB.
- **Projects** - a project has a name and instructions. Chats inside a project send those instructions to the model with every request.
- **Sidebar** - search, rename (inline), delete (with confirmation), move to project, share, and grouping of recent chats.
- **Share** - copy the chat as text or download it as a Markdown file. There are no public links because that needs a database.
- **Internationalization** - a small custom i18n layer (`src/lib/i18n.tsx`) with dictionaries for English, Hindi, Spanish, French, German, Portuguese, Japanese, Chinese and Russian.
- **Responsive layout** - the sidebar is a fixed panel on desktop and a slide-in drawer on mobile.
- **Loading screen** - shown while the page loads, with a minimum display time and a safe timeout.
- **Footer** - policy pages, help center FAQs and a contact window. These open as modal windows through a React portal so they are never clipped by the footer.

## Tooling

- **Node.js and npm** - runtime and package manager.
- **ESLint** - code quality checks (`npm run lint`).
- **Git and GitHub** - version control and hosting for the source code.
- **Vercel** - recommended hosting for deployment.

## Services

- **Google AI Studio** - to create the Gemini API key (free tier).
- **Google Cloud Console** - to create the OAuth client for Google sign-in.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Key for the Gemini API (server only) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | No | Enables "Continue with Google" |
| `GEMINI_MODEL` | No | Forces a specific Gemini model |

## Notes

- The `@anthropic-ai/sdk` package was installed during the first setup, but the app now uses the Gemini API. It is not used and can be removed with `npm uninstall @anthropic-ai/sdk`.
- Because accounts and chats live in the browser, the next step for a production version would be a database and server-side authentication (for example Supabase), plus streaming responses.