# Cadence

A calm, elegant planner for a senior design team. Connect Canvas once and every assignment, due date, description and attached file shows up for the whole team. Break assignments into tasks and subtasks, hand them to teammates, and get reminders before anything is due.

## What it does

- **Canvas sync.** One person connects Canvas with a personal access token (best: full descriptions, files, points) or the Canvas calendar feed link (fallback: titles and due dates). Cadence checks again every few hours and tells the team when something new is posted or a due date moves.
- **Tasks and subtasks.** Every assignment gets a task list. Tap a task to assign it, give it a date, add subtasks and notes.
- **Teammates.** Share one invite link. Opening it lets a teammate create an account and join in seconds.
- **Reminders.** Push notifications 3 days, 1 day and a few hours before deadlines, a day before your own tasks are due, and when someone hands you a task. Everything also lands in the in-app Updates inbox.
- **Installable.** It's a PWA: "Add to Home Screen" on iPhone or "Install app" on Android/desktop. On iPhone, push notifications require installing it to the Home Screen first (iOS 16.4+).

## Run it locally

```bash
npm install
npm run build
npm start                       # http://localhost:8787
```

For development with hot reload: `node --watch server/index.js` in one terminal and `npx vite` in another (http://localhost:5173).

To try Canvas sync without a real token, run the fake Canvas server with `node scripts/mock-canvas.js`, then connect with address `http://localhost:8790` and any token.

## Deploy

It's one Node process with a SQLite database, so it needs an always-on host with a persistent disk (the background sync and reminders run inside the server). The included `Dockerfile` works on Railway, Fly.io or Render; mount a volume at `/data` and set `APP_SECRET`. See `.env.example`.

## Stack

Node 22 + Express, built-in `node:sqlite`, React 18 + Vite, Web Push (VAPID), no CSS framework.
