# Cadence

A calm, elegant planner for a senior design team. Connect Canvas once and every assignment, due date, description and attached file shows up for the whole team. Break assignments into tasks and subtasks, hand them to teammates, and get reminders before anything is due.

## What it does

- **Canvas sync.** One person connects Canvas with a personal access token (best: full descriptions, files, points) or the Canvas calendar feed link (fallback: titles and due dates). Cadence checks again every few hours and tells the team when something new is posted or a due date moves.
- **Tasks and subtasks.** Every assignment gets a task list. Tap a task to assign it, give it a date, add subtasks and notes.
- **Teammates.** Share one invite link. Opening it lets a teammate create an account and join in seconds.
- **Reminders.** Push notifications 3 days, 1 day and a few hours before deadlines, a day before your own tasks are due, and when someone hands you a task. Everything also lands in the in-app Updates inbox.
- **Google Docs, built in.** Connect Google Drive once and Cadence keeps a team folder (one subfolder per assignment) shared with every teammate. Tap New Doc / Sheet / Slides on any assignment or task and the file is created, named, filed and shared for you. Pick existing files with the Drive picker, or paste any link. The Docs tab collects every team doc plus every file attached in Canvas, with search. Docs preview inside the app on a computer and open straight in the Google apps on a phone.
- **Installable.** It's a PWA: "Add to Home Screen" on iPhone or "Install app" on Android/desktop. On iPhone, push notifications require installing it to the Home Screen first (iOS 16.4+).

## Run it locally

```bash
npm install
npm run build
npm start                       # http://localhost:8787
```

For development with hot reload: `node --watch server/index.js` in one terminal and `npx vite` in another (http://localhost:5173).

To try Canvas sync without a real token, run the fake Canvas server with `node scripts/mock-canvas.js`, then connect with address `http://localhost:8790` and any token.

## Google setup (one time, about 10 minutes)

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project, then enable the **Google Drive API** and **Google Picker API**.
2. **OAuth consent screen**: External, app name Cadence, add the scope `.../auth/drive.file`, and add each teammate's Google email as a test user (or publish the app; `drive.file` is a non-sensitive scope).
3. **Credentials → Create OAuth client ID → Web application.** Authorized JavaScript origin: your app URL. Authorized redirect URI: `<your app URL>/api/google/callback`.
4. **Credentials → Create API key** (restrict it to the Picker API and your app URL).
5. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_API_KEY`, `GOOGLE_APP_ID` (the project number) and `PUBLIC_URL` on the server.

To test locally without Google: `node scripts/mock-google.js` and point the app at it (see the comment at the top of that file).

## Password reset emails (one time, about 5 minutes)

1. Create a free account at brevo.com (300 emails a day).
2. Under Senders, add and verify the address the emails should come from (a Gmail is fine).
3. Under SMTP & API → API keys, create a key.
4. Set `BREVO_API_KEY` and `MAIL_FROM` (for example `Cadence <you@gmail.com>`). "Forgot password?" appears on the sign-in screen once both are set.

## Deploy

It's one Node process with a SQLite database, so it needs an always-on host with a persistent disk (the background sync and reminders run inside the server). The included `Dockerfile` works on Railway, Fly.io or Render; mount a volume at `/data` and set `APP_SECRET`. See `.env.example`.

## Stack

Node 22 + Express, built-in `node:sqlite`, React 18 + Vite, Web Push (VAPID), no CSS framework.
