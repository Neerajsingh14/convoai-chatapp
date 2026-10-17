# ConvoAI

ConvoAI is an AI chat assistant built with Next.js, Tailwind CSS and Google Gemini.
It replies in the language you write, whether that is English, Hindi, Hinglish or one of 9 supported languages.
You can upload images, PDFs and code files, speak your questions with voice input, and organise chats into projects.
It also includes chat history, sharing, Google login, and dark and light themes.

## Features

- **Chat with Google Gemini** - answers in the same language you write (English, Hindi, Hinglish and more)
- **File understanding** - attach up to 4 images, PDFs or text/code files per message (button, drag and drop, or paste a screenshot)
- **Voice input** - speak instead of typing (Chrome and Edge)
- **Chat modes** - Friendly, Study buddy, Coder and Professional
- **Sidebar** - chat history, search, rename, delete, share and move chats
- **Projects** - group chats and add custom instructions that apply to every chat inside a project
- **Share** - copy a conversation or download it as a Markdown file
- **Accounts** - email and password, or Google sign-in (login is required to send messages)
- **Interface in 9 languages** - English, Hindi, Spanish, French, German, Portuguese, Japanese, Chinese and Russian
- **Themes** - dark by default, light on demand
- **Responsive** - works on desktop and mobile
- **Extras** - Markdown rendering, code blocks with copy button, regenerate reply, loading screen, footer with policy pages and help center

## Tech stack

Next.js, React, TypeScript, Tailwind CSS, Google Gemini API, Google Identity Services, Web Crypto and Web Speech APIs.
The full list with explanations is in [docs/TECH_STACK.md](docs/TECH_STACK.md).

## Getting started

Follow these steps to run ConvoAI on your own computer.

### 1. Prerequisites

- **Node.js 20.9 or newer** (the LTS version is recommended) - download from https://nodejs.org
- **A free Gemini API key** - see step 4
- A code editor such as VS Code (optional)

Check your Node version:

```bash
node -v
```

### 2. Get the code

**Option A - with Git:**

```bash
git clone https://github.com/Neerajsingh14/convoai-chatapp.git
cd convoai-chatapp
```

**Option B - download the ZIP (no Git needed):**

1. Open the repository page on GitHub.
2. Click the green **Code** button, then **Download ZIP**.
3. Extract the ZIP file.
4. Open a terminal inside the extracted folder (in VS Code: File, Open Folder, then Terminal, New Terminal).

### 3. Install dependencies

```bash
npm install
```

### 4. Add your environment variables

Copy the example file to a new file named `.env.local`.

Windows (PowerShell):

```powershell
Copy-Item .env.example .env.local
```

Mac or Linux:

```bash
cp .env.example .env.local
```

Open `.env.local` and paste your key:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

**How to get a Gemini API key (free):**

1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key**.
3. Copy the key into `.env.local` as shown above.

Never share this key or commit `.env.local` to GitHub. It is already ignored by `.gitignore`.

### 5. (Optional) Enable "Continue with Google"

Email and password login works without this step. To turn on Google sign-in:

1. Open https://console.cloud.google.com and create a project.
2. Go to **Google Auth Platform** (or APIs and services, then OAuth consent screen) and finish the setup. Choose **External**.
3. If the app is in Testing mode, add your own Gmail under **Audience, Test users**.
4. Go to **Clients, Create client**, choose **Web application**, and add these under **Authorized JavaScript origins**:

```
http://localhost:3000
http://localhost
```

5. Copy the **Client ID** (it ends with `.apps.googleusercontent.com`) into `.env.local`:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id_here
```

You do not need the client secret.

### 6. Run the app

```bash
npm run dev
```

Open http://localhost:3000 in your browser. The frontend and the backend (the `/api/chat` route) both run from this single command.

After changing `.env.local`, stop the server with `Ctrl + C` and start it again.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the development server at http://localhost:3000 |
| `npm run build` | Creates an optimized production build |
| `npm start` | Runs the production build (run `npm run build` first) |
| `npm run lint` | Checks the code with ESLint |

## Project structure

```
convoai-chatapp/
|-- docs/
|   `-- TECH_STACK.md        Tech stack and design notes
|-- public/                  Static files
|-- src/
|   |-- app/
|   |   |-- api/chat/route.ts   Backend: talks to the Gemini API
|   |   |-- globals.css         Themes, fonts and animations
|   |   |-- icon.svg            Favicon
|   |   |-- layout.tsx          Root layout, fonts, theme script
|   |   `-- page.tsx            Home page
|   |-- components/
|   |   |-- Chat.tsx            Main app: chat, sidebar, login, projects
|   |   |-- LanguageMenu.tsx    Interface language picker
|   |   |-- SiteFooter.tsx      Footer, policies and help center
|   |   `-- Splash.tsx          Loading screen
|   `-- lib/
|       |-- i18n.tsx            Translations for 9 languages
|       `-- site.ts             Site name, author and contact details
|-- .env.example             Template for environment variables
|-- package.json
`-- README.md
```

## Deploy to Vercel

1. Push the project to GitHub.
2. Go to https://vercel.com, sign in with GitHub and click **Add New, Project**.
3. Import this repository.
4. Before deploying, open **Environment Variables** and add `GEMINI_API_KEY` (and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` if you use Google login).
5. Click **Deploy**.
6. If you use Google login, add your Vercel URL (for example `https://your-app.vercel.app`) to **Authorized JavaScript origins** in Google Cloud Console.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "GEMINI_API_KEY not found" | Check that `.env.local` exists in the project root and restart the dev server |
| "This model is currently experiencing high demand" (503) | The Gemini service is busy. Wait a few seconds and use Regenerate. The app also tries several models automatically |
| 429 or quota errors | You hit the free tier limit. Wait a bit, or set a different `GEMINI_MODEL` |
| `npm install` fails with ENOTFOUND | Network or DNS problem. Check your internet connection and try again |
| Google login shows `origin_mismatch` | The URL you opened must exactly match an Authorized JavaScript origin, for example `http://localhost:3000` |
| Google login shows "Access blocked" | Add your Gmail as a Test user in the OAuth consent screen |
| Port 3000 is already in use | Stop the other server, or run `npm run dev -- -p 3001` (Google login then needs that origin added too) |
| Voice input does not work | Use Chrome or Edge and allow microphone access |

## Known limitations

- Accounts, chats and projects are stored in your own browser (local storage). They are not synced across devices, and clearing browser data removes them.
- Email and password accounts exist only in the browser where they were created. There is no password reset.
- The login requirement is enforced in the interface only. For real protection, server-side accounts are needed.
- Images attached to old chats are not kept after a page reload (only the file name is saved) to avoid filling browser storage.
- Messages and files you send are processed by the Google Gemini API. On the free tier, Google may use them to improve its products, so do not share sensitive information.

## Author

Designed and built by **Neeraj Singh Rajpurohit**.

- Portfolio: https://neeraj-portfolio-self.vercel.app/
- Email: neerajpurohit520@gmail.com

If you find a problem or have an idea, feel free to open an issue or contact me.