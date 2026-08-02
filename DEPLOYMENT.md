# Deploying ConverseIQ

ConverseIQ is two processes, and they deploy differently:

| Part | What it is | Where it runs |
|------|------------|---------------|
| `dashboard/` | Next.js console — dispatches calls, shows live status | Vercel (serverless) |
| `agent.py` | LiveKit agent worker — the voice on the call | A long-running host (Docker, Render, Fly, a VPS) |

The dashboard **cannot** host the agent. The agent holds an open WebSocket to
LiveKit for the entire call; serverless functions are killed between requests.
If you deploy only the dashboard, calls will dial out and then sit in silence
because no agent ever joins the room.

---

## 1. Deploy the dashboard to Vercel

### Option A — Vercel CLI

```bash
npm i -g vercel
```

```bash
cd dashboard && vercel
```

The CLI opens a browser for login, then asks a few setup questions. Accept the
defaults; the framework is detected as Next.js.

When it finishes, add your environment variables and redeploy to production:

```bash
cd dashboard && vercel env add LIVEKIT_URL production
```

Repeat for `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and `VOBIZ_SIP_TRUNK_ID`,
then:

```bash
cd dashboard && vercel --prod
```

### Option B — Vercel dashboard

1. Push this repo to GitHub.
2. At [vercel.com/new](https://vercel.com/new), import the repository.
3. **Set the Root Directory to `dashboard`.** This is the step people miss —
   without it Vercel tries to build the Python project at the repo root.
4. Add the environment variables from [`dashboard/.env.example`](dashboard/.env.example).
5. Deploy.

### Verifying

Open the deployment. The banner at the top tells you exactly what is still
missing — it reads `/api/health`, which reports variable *names* only and never
values. A green banner means the dashboard can reach LiveKit.

---

## 2. Deploy the agent worker

The dashboard is useless without this. Pick whichever fits.

### LiveKit Cloud Agents (recommended)

No second account, no server to run — it hosts the worker next to the SIP
infrastructure it already talks to.

```bash
lk agent create --region ap-south --secrets-file agent.env .
```

`agent.env` holds every key from the root `.env` **except** `LIVEKIT_URL`,
`LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` — Cloud injects those itself, and
passing them is rejected as a duplicate.

Pick the region nearest your callers (`us-east`, `eu-central`, `ap-south`). It
writes a `livekit.toml` holding the agent id; commit it so later deploys update
the same agent rather than creating a new one.

Afterwards:

```bash
lk agent status
```

```bash
lk agent logs
```

```bash
lk agent deploy
```

Two things to know:

- `LIVEKIT_LOAD_THRESHOLD` is ignored here. Cloud manages capacity itself and
  logs a warning saying so. The variable still matters for the options below.
- `.dockerignore` keeps `.env` out of the image. Secrets arrive as environment
  variables at run time, so nothing is baked into a layer.

### Docker (any VPS)

```bash
docker compose up -d --build
```

`docker-compose.yml` reads the root `.env`, so fill that in first
(`cp .env.example .env`).

### Render / Railway / Fly

Deploy the repo root as a **background worker**, not a web service:

- Build: `pip install -r requirements.txt`
- Start: `python agent.py start`
- Environment: everything in the root `.env.example`

There is no HTTP port to expose. A platform that insists on a health-check port
will mark the service unhealthy — choose the worker/background service type.

### Locally, while testing

```bash
python agent.py start
```

Leave it running. It logs `registered worker` once it is connected to LiveKit.

---

## 3. Check it end to end

1. Agent worker running (locally or deployed).
2. Dashboard open, banner green.
3. Enter your own phone number in international format and click **Make Call**.

Expected sequence in Call History: `Connecting` → `Ringing` → `Connected`, with
a running duration. Your phone rings and the agent speaks.

### If the status stays on `Connecting`

The SIP leg never came up. Check the trunk id, and that your SIP provider
allows the destination country.

### If the dispatch fails with "no agent joined within 15s"

The dashboard waits for the agent to be in the room before dialling, so this
error means nobody is answering the job. Two usual causes:

1. **No worker running.** Start it: `python agent.py start`.
2. **The worker is refusing jobs.** `agent.py start` runs in production mode,
   where the load threshold defaults to `0.7`. A machine also running the
   dashboard and a browser sits near that already, so the worker flaps between
   available and unavailable and never takes the job. Its log shows repeated
   `worker is at full capacity, marking as unavailable`.

   Fix by setting `LIVEKIT_LOAD_THRESHOLD=1.0` in `.env`, or run
   `python agent.py dev` locally, where the gate is disabled by default.

### If it reaches `Connected` but nobody speaks

The agent joined but its plugins failed — usually a missing key. Check its logs.
The voice you picked in the dashboard determines which key it needs:
`OPENAI_API_KEY` for Alloy/Echo/Shimmer, `SARVAM_API_KEY` for Anushka/Aravind,
plus `DEEPGRAM_API_KEY` for transcription and `GROQ_API_KEY` if the model is Groq.

### If a call fails immediately

The error is shown in the call's detail panel. It comes straight from LiveKit,
so it names the real cause (bad trunk, unauthorized number, no credit).

---

## Notes on data

Call history lives in **browser localStorage**, not on the server. It is
per-browser and per-device, and clearing site data clears it. Use the CSV export
button to keep a copy.

This is deliberate: Vercel's filesystem is read-only and per-invocation, so the
previous file-backed store silently lost every record in production. If you need
shared, durable history, add a database and replace `dashboard/lib/call-store.ts`
— it is the only module that touches storage.
