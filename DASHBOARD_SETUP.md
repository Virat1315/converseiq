# Dashboard Setup Guide

How to run the ConverseIQ console locally and what its API does. For putting it
on the internet, see [DEPLOYMENT.md](DEPLOYMENT.md).

## 🎯 What it does

- **Structured screening** — up to 4 questions, asked on script; the agent will
  not answer questions about pay bands, benefits or process
- **Deterministic scoring** — answers marked out of 100 by arithmetic, not by
  the model's opinion, so identical answers always score identically
- **Ranking** — candidates sorted best-match first, with a per-question breakdown
- **Spreadsheet import** — .xlsx or .csv, with column auto-detection
- **Per-call voice and model** — Indian or US voices, Groq or OpenAI
- **Live status** — `Connecting → Ringing → Connected`, with a running timer,
  read from LiveKit rather than guessed
- **Hang up** a call in progress
- **CSV export** of the ranked table
- **Setup banner** naming any environment variable that is still missing

## 📁 Project Structure

```
├── dashboard/
│   ├── app/
│   │   ├── page.tsx                 # Page shell
│   │   ├── layout.tsx               # App layout
│   │   ├── icon.svg                 # Favicon
│   │   └── api/
│   │       ├── dispatch/route.ts    # POST — place one call
│   │       ├── queue/route.ts       # POST — place a batch
│   │       ├── status/route.ts      # GET  — live call state
│   │       ├── hangup/route.ts      # POST — end a call
│   │       └── health/route.ts      # GET  — configuration status
│   ├── components/
│   │   ├── Dashboard.tsx            # Tabs + setup banner
│   │   ├── CampaignSetup.tsx        # Questions + scoring thresholds
│   │   ├── CandidatesPanel.tsx      # Import / manual entry / dispatch
│   │   ├── ResultsPanel.tsx         # Ranked results + export
│   │   ├── SetupBanner.tsx          # Missing-config warning
│   │   └── ui.tsx                   # Shared primitives
│   └── lib/
│       ├── screening.ts             # Questions, scoring, ranking, agent script
│       ├── server-utils.ts          # LiveKit clients + dispatch
│       ├── import-candidates.ts     # .xlsx / .csv reader
│       ├── phone.ts                 # E.164 normalisation
│       ├── call-store.ts            # History (browser localStorage)
│       └── agent-options.ts         # Voices and models
├── call_analyzer.py                 # Optional: AI summaries (Flask)
├── call_dispatcher_service.py       # Optional: CLI dispatcher
├── agent.py                         # LiveKit AI agent worker
├── config.py                        # Prompts, models, voices
└── requirements.txt                 # Python dependencies
```

## 🚀 Setup

### 1. Install dependencies

**Dashboard:**
```bash
cd dashboard && npm install
```

**Agent worker:**
```bash
pip install -r requirements.txt
```

### 2. Configure environment

Two separate files — the dashboard and the agent do not share one.

```bash
cp .env.example .env
```

```bash
cp dashboard/.env.example dashboard/.env.local
```

Fill both in. Neither file should ever be committed.

> **Never paste real keys into documentation or issues.** An earlier version of
> this guide included a filled-in example with working credentials; anything
> committed to a public repo must be treated as compromised and rotated.

### 3. Start the services

**Terminal 1 — agent worker** (required; this is the voice on the call):
```bash
python agent.py start
```
Expected output: `registered worker`

**Terminal 2 — dashboard:**
```bash
cd dashboard && npm run dev
```
Expected output: `Ready in 1234ms`

**Terminal 3 — call analyzer** (optional, for AI summaries):
```bash
python call_analyzer.py
```

### 4. Open the dashboard

<http://localhost:3000>

The banner at the top reports whether the configuration is complete. Fix
anything it names before making a call.

## 📱 How to use

**Campaign tab** — enable up to four questions and set the thresholds they are
scored against. The generated agent script is shown beside them; that script is
what the bot is bound to on every call in the campaign.

**Candidates tab** — drop in a spreadsheet or type numbers in. Then pick a voice
and press *Start screening*. Calls are placed one at a time.

**Results tab** — candidates ranked best-match first. Expand a row for the
per-question breakdown, or export the table to CSV.

Notes:

- Phone numbers are normalised to E.164. `9876543210` becomes `+919876543210`;
  change `DEFAULT_COUNTRY_CODE` in `lib/phone.ts` for a different default.
- Voice and model are sent as room metadata; `agent.py` reads them and picks the
  matching TTS and LLM provider for that call.
- Live status is polled from LiveKit every three seconds, not guessed.
- The red button on a live row hangs up.

## 📈 How scoring works

Enabled questions split 100 points evenly, so a three-question campaign is still
scored out of 100 and stays comparable with a four-question one.

| Question | Full marks | Zero marks |
|----------|-----------|------------|
| Experience | at or above the minimum | no experience |
| Expected salary | at or under budget | 1.5× budget |
| Relocation | willing, or not required | unwilling when required |
| Notice period | at or under the limit | 2× the limit |

Between those two points the score falls off linearly. A candidate who says they
are not interested scores 0 and is labelled accordingly. Unanswered questions
score 0 and are listed in the breakdown, so a high score from a half-finished
call is never mistaken for a complete one.

Ties break toward the more complete screening.

Because scoring happens on the dashboard rather than during the call, changing
the criteria re-ranks every candidate immediately — nobody is called twice.

## 🔧 API Endpoints

### POST /api/dispatch
Place a single outbound call.

**Request:**
```json
{
  "to": "+918319402171",
  "prompt": "Custom message",
  "voiceId": "alloy",
  "modelProvider": "groq",
  "callId": "optional-client-id"
}
```

**Response:**
```json
{
  "success": true,
  "phoneNumber": "+918319402171",
  "roomName": "call-918319402171-a1b2c3",
  "dispatchId": "SCL_abc123",
  "participantIdentity": "sip_+918319402171",
  "callId": "optional-client-id"
}
```

**Errors:** `400` invalid or missing number · `503` deployment not configured
(the body's `missing` array names the variables) · `502` LiveKit or the SIP
trunk rejected the call.

### POST /api/queue
Place a batch of calls, dialled sequentially. Maximum 50 per request.

**Request:**
```json
{
  "numbers": ["+918319402171", "+919988776655"],
  "prompt": "Campaign script",
  "voiceId": "anushka",
  "modelProvider": "groq"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Dispatched 2 of 2 calls",
  "dispatched": 2,
  "total": 2,
  "results": [
    { "phoneNumber": "+918319402171", "status": "dispatched", "roomName": "call-...", "id": "SCL_..." }
  ]
}
```

One bad number fails on its own without aborting the batch.

### GET /api/status?rooms=room1,room2
Live state of calls in flight, read from LiveKit.

**Response:**
```json
{
  "statuses": {
    "call-918319402171-a1b2c3": {
      "status": "connected",
      "duration": 42,
      "participants": 2,
      "agentPresent": true
    }
  }
}
```

`status` is one of `connecting`, `ringing`, `connected`, `completed`. A room
LiveKit no longer knows about reports `completed` — it tears rooms down once
everyone has left.

### POST /api/hangup
End a call.

**Request:**
```json
{ "roomName": "call-918319402171-a1b2c3" }
```

Deleting an already-finished room is a no-op, so this is safe to retry.

### GET /api/health
What this deployment can do right now. Returns variable *names* only — never
values.

**Response:**
```json
{
  "livekitReady": true,
  "telephonyReady": false,
  "missingRequired": [],
  "missingTelephony": ["VOBIZ_SIP_TRUNK_ID"],
  "livekitHost": "your-project.livekit.cloud",
  "outboundNumber": "+91XXXXXXXXXX"
}
```

### POST /api/analyze
Analyze a completed call. Served by `call_analyzer.py` (Flask, port 5000), not
by Next.js.

**Request:**
```json
{
  "call_id": "1702345678",
  "transcript": "Agent: Hello... User: Hi...",
  "prompt": "Call prompt",
  "duration": 120
}
```

## 📊 Data Storage

Call history lives in **browser localStorage** under `converseiq.calls.v1`, not
on the server. It is per-browser and per-device; clearing site data clears it.

This is deliberate. The previous version wrote to `data/calls.json`, which works
locally but silently discards every record on Vercel, where the filesystem is
read-only and per-invocation.

Live state is never stored — it is read from LiveKit on every poll, so it cannot
go stale.

To move history into a real database, replace `dashboard/lib/call-store.ts`. It
is the only module that touches storage.

## 🚨 Troubleshooting

### "Missing environment variables: ..."
Exactly what it says — the response lists every one. Add them to
`dashboard/.env.local` and restart, or to your Vercel project settings and
redeploy.

### Call stuck on "Connecting"
The SIP leg never came up. Check the trunk id, and that your provider allows the
destination country. After a few seconds the row flips to `Failed` with the
reason.

### Reaches "Connected" but nobody speaks
`python agent.py start` is not running, or it crashed on a missing key. The
voice you selected decides which key it needs: `OPENAI_API_KEY` for
Alloy/Echo/Shimmer, `SARVAM_API_KEY` for Anushka/Aravind. `DEEPGRAM_API_KEY` is
always needed, and `GROQ_API_KEY` when the model is Groq.

### Dashboard not loading
```bash
cd dashboard && npm install
```
Then `npm run dev`.

## 📞 Example Prompts

**Recruitment**
```
You are calling about a Product Manager opening. Introduce yourself, ask if they
are interested, and offer to collect their email for follow-up.
```

**Customer feedback**
```
You are calling to ask about a recent purchase. Ask how satisfied they were on a
scale of one to five, and what would have made the experience better.
```

**Lead generation**
```
You are calling a new inbound lead. Find out what problem they are trying to
solve, their team size, and their timeline.
```

## 🔐 Security Notes

- Keep `.env` and `dashboard/.env.local` out of version control — both are
  already in `.gitignore`.
- Anything committed to a public repo is compromised. Removing it from the file
  does not remove it from git history; **rotate the key instead**.
- The dashboard has **no authentication**. A public deployment lets anyone place
  calls on your trunk. Put Vercel Password Protection or an auth layer in front
  of it before sharing the URL.
- Call transcripts may contain personal information.
- Rate-limit the API endpoints before exposing them.

## 📈 Future Enhancements

- [ ] Authentication and multi-user support
- [ ] Database-backed history shared across devices
- [ ] Live transcript streaming into the dashboard
- [ ] Call recording and playback
- [ ] Automatic post-call summaries in the UI
- [ ] Call scheduling
- [ ] CRM integrations

## 📚 Resources

- [LiveKit Documentation](https://docs.livekit.io)
- [LiveKit SIP](https://docs.livekit.io/sip/)
- [Groq API](https://console.groq.com)
- [Deepgram Speech AI](https://deepgram.com)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
