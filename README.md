# ConverseIQ

> **Enterprise AI Voice Platform for intelligent customer conversations, automated calling, live transcription, and AI-powered voice workflows.**

ConverseIQ is a production-ready AI voice platform that enables businesses to automate customer interactions using Large Language Models (LLMs), real-time speech recognition, and natural voice synthesis. It supports intelligent outbound calling, live transcription, AI-generated responses, call routing, and a web dashboard for managing conversations.

---

## 🚀 Features

- 🎙️ Real-time AI voice conversations
- 📋 **Structured phone screening** — up to 4 questions, asked on script
- 🏆 **Automatic scoring and ranking** of candidates by best match
- 📄 **Spreadsheet import** (.xlsx / .csv) of who to call
- 🧠 Groq-powered conversational intelligence
- 📞 Automated outbound calling
- 📝 Live Speech-to-Text transcription using Deepgram
- 🔊 Natural Text-to-Speech voice responses
- 📊 Web dashboard with live call status and CSV export
- ⚡ Low-latency voice pipeline powered by LiveKit
- 🐳 Docker-ready deployment
- 🔧 Configurable prompts, models, and voice settings

---

## 🏗️ Architecture

```text
Customer
    │
    ▼
LiveKit Voice Pipeline
    │
    ▼
Deepgram Speech-to-Text
    │
    ▼
Groq LLM
    │
    ▼
Deepgram Text-to-Speech
    │
    ▼
AI Voice Response
```

---

# 🛠 Tech Stack

| Category | Technologies |
|----------|--------------|
| Backend | Python, FastAPI |
| Frontend | Next.js, TypeScript |
| Voice Infrastructure | LiveKit |
| Speech Recognition | Deepgram |
| Large Language Model | Groq (Llama 3.3) |
| Deployment | Docker |

---

# 📁 Project Structure

```text
dashboard/                  # Next.js console (deploys to Vercel)
  app/api/dispatch/         #   POST — place one call
  app/api/queue/            #   POST — place a batch of calls
  app/api/status/           #   GET  — live state of calls in flight
  app/api/hangup/           #   POST — end a call
  app/api/health/           #   GET  — which env vars are configured
  lib/server-utils.ts       #   LiveKit clients + dispatch logic
  lib/call-store.ts         #   Call history (browser localStorage)
agent.py                    # AI Voice Agent (long-running worker)
config.py                   # Prompts, models, voices
make_call.py                # Outbound Calling Utility (CLI)
call_dispatcher_service.py  # Call Dispatcher (CLI)
call_analyzer.py            # Call Analytics
create_trunk.py             # SIP Trunk Utilities
setup_trunk.py              # SIP Configuration
docker-compose.yml          # Docker Deployment
requirements.txt            # Python Dependencies
DEPLOYMENT.md               # Vercel + worker deployment guide
```

---

# ⚙️ Installation

## 1. Clone Repository

```bash
git clone https://github.com/Virat1315/converseiq.git
cd converseiq
```

## 2. Create Virtual Environment

### Windows

```powershell
python -m venv .venv
.venv\Scripts\activate
```

### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
```

---

## 3. Install Dependencies

```bash
pip install -r requirements.txt
```

---

## 4. Configure Environment

Copy the environment template.

### Linux / macOS

```bash
cp .env.example .env
```

### Windows

```powershell
copy .env.example .env
```

Configure the following variables inside `.env`:

```env
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

DEEPGRAM_API_KEY=

GROQ_API_KEY=

VOBIZ_SIP_TRUNK_ID=
VOBIZ_USERNAME=
VOBIZ_PASSWORD=
```

`.env.example` lists the rest, including the keys each voice needs.

The dashboard reads its own file — copy `dashboard/.env.example` to
`dashboard/.env.local` as well.

---

# ▶️ Running the Project

ConverseIQ runs as **two processes**. Both need to be up for a call to work.

### 1. The agent worker — the voice on the call

```bash
python agent.py start
```

Leave this running. Without it, calls dial out and then sit in silence, because
nothing ever joins the room to talk.

### 2. The dashboard — the console you drive it from

```bash
cd dashboard && npm install && npm run dev
```

Copy `dashboard/.env.example` to `dashboard/.env.local` and fill it in first.
Open <http://localhost:3000>; the banner at the top tells you what is still
missing.

### Or skip the dashboard and use the CLI

```bash
python make_call.py --to +91XXXXXXXXXX
```

Use the destination number in international format, including the country code.

---

# 📊 Dashboard — phone screening

Open <http://localhost:3000> (or your Vercel URL). The console runs a hiring
campaign in three steps.

### 1. Campaign — what to ask, and how to score it

Pick up to **five** screening questions and set the thresholds they are scored
against:

| Question | Scored against |
|----------|----------------|
| Years of relevant experience | Minimum required |
| Background + top 5 skills | The skills the role actually wants |
| Expected pay (LPA) | Budget — zero marks at 1.5× |
| Open to relocation | Whether the role requires it |
| Notice period | Longest workable — zero marks at 2× |

Five is a hard cap: screening calls that run longer get hung up on.

The skills question is the only open one — the candidate names their own top
five, in their own words, and those are matched against the role's wanted list.
The wanted list is never read out, so nobody can just repeat it back. Someone
who matches none of it is capped below *Strong match* however well they score
elsewhere.

The agent script is generated from these settings and shown beside them. It
binds the bot to **asking** the questions — it will not answer questions about
salary bands, benefits, interview rounds, or the team, and will not tell the
candidate how they scored. Off-topic questions get "I'm only collecting a few
details right now — the recruiter will cover that" and the script moves on.

### 2. Candidates — who to call

Drop in an **.xlsx or .csv**, or type numbers in by hand. Columns are
auto-detected: a header containing "phone"/"mobile"/"contact" wins, otherwise
whichever column parses as phone numbers most often. Numbers are normalised to
E.164, so `9876543210`, `+91 98765 43210` and `00919876543210` all work.
Duplicates and unusable rows are listed rather than silently dropped.

### 3. Results — ranked best-match first

Candidates are scored out of 100 and sorted. Expanding a row shows the
per-question breakdown — what they said, and the points it earned.

Scoring is deterministic arithmetic, not the model's opinion, so identical
answers always produce identical marks. It also means **changing the criteria
re-ranks everyone instantly** — raise the budget and the expensive candidate
moves up, with nobody called again.

Each row has a **Call again** button — a redial runs the same campaign script and
lands as a separate record, so the first attempt's outcome is still there next to
it.

Export the ranked table to CSV at any point, including which wanted skills each
candidate matched and which they missed.

The setup banner reads `/api/health` and names any missing environment
variable, so a misconfigured deployment says what is wrong instead of failing
on the first call. Results are stored in your **browser**, not on the server —
see the note at the end of [DEPLOYMENT.md](DEPLOYMENT.md).

---

# ☁️ Deployment

The dashboard deploys to Vercel; the agent needs a long-running host. Full
instructions, including the common mistakes, are in
**[DEPLOYMENT.md](DEPLOYMENT.md)**.

```bash
cd dashboard && vercel
```

> Deploying via the Vercel web UI? Set the **Root Directory to `dashboard`** —
> otherwise the build tries to compile the Python project at the repo root.

---

# 🔧 Troubleshooting

## Model Decommissioned

Update the model inside `config.py` to a supported Groq model such as:

- `llama-3.3-70b-versatile`
- `llama-3.1-8b-instant`

Restart the agent.

---

## SIP Trunk Not Found

List available trunks:

```bash
python list_trunks.py
```

Create one if required:

```bash
python create_trunk.py
```

Update the generated trunk ID inside `.env`.

---

## Port Already in Use

Terminate the running process or change the configured port before restarting the application.

---

## Missing Dependencies

Ensure the virtual environment is activated.

```bash
pip install -r requirements.txt
```

---

# 🚀 Future Improvements

- CRM integrations
- Multi-agent workflows
- Sentiment analysis
- RAG-powered knowledge base
- Voice authentication
- Conversation analytics dashboard
- Appointment scheduling
- WhatsApp & Email follow-ups
- Multilingual conversations

---

# 📌 Use Cases

- Customer Support
- Appointment Booking
- Sales Outreach
- Lead Qualification
- Call Automation
- Voice Assistants
- Helpdesk Automation

---

# 👨‍💻 Author

**Virat Patel**

B.Tech, IIIT Naya Raipur

Enterprise AI • Product Management • AI Applications

---

## ⭐ If you found this project useful, consider starring the repository.