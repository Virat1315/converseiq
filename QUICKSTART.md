# 🚀 Quick Start Guide

Get the AI-powered Call Manager running in 5 minutes!

## ⚡ Ultra-Quick Setup

### Windows
```bash
# Open PowerShell and run:
.\start_services.bat
```

### macOS/Linux
```bash
chmod +x start_services.sh
./start_services.sh
```

Then open: **http://localhost:3000**

## 📋 Prerequisites

✅ Ensure you have:
- Python 3.9+ installed
- Node.js 18+ installed
- `.env` filled in at the repo root (copy from `.env.example`)
- `dashboard/.env.local` filled in (copy from `dashboard/.env.example`)
- Virtual environment set up: `.venv` folder

## 🔧 Manual Setup (if scripts don't work)

### Terminal 1: Start AI Agent
```bash
# Windows
.\.venv\Scripts\Activate.ps1
python agent.py start

# macOS/Linux
source .venv/bin/activate
python agent.py start
```

### Terminal 2: Start Analyzer Service
```bash
# Windows
.\.venv\Scripts\Activate.ps1
python call_analyzer.py

# macOS/Linux
source .venv/bin/activate
python call_analyzer.py
```

### Terminal 3: Start Dashboard
```bash
cd dashboard
npm run dev
```

## 📱 Using the Dashboard

1. **Open** http://localhost:3000
2. **Check** the banner at the top — it names anything still unconfigured
3. **Enter** a phone number in international format (e.g., +918319402171)
4. **Pick** a prompt preset, or write your own
5. **Choose** a voice and model
6. **Click** "Make Call" and watch the row go `Connecting → Ringing → Connected`

## 🎯 What You Get

| Feature | Status |
|---------|--------|
| Phone number input, validated server-side | ✅ Done |
| Call prompt customization + presets | ✅ Done |
| Per-call voice and model selection | ✅ Done |
| Live call status polled from LiveKit | ✅ Done |
| Hang up a call in progress | ✅ Done |
| Call duration tracking | ✅ Done |
| Bulk campaigns (up to 50 numbers) | ✅ Done |
| Call history with CSV export | ✅ Done |
| Setup banner for missing config | ✅ Done |
| Dark theme, responsive | ✅ Done |
| AI summary and sentiment in the UI | ⏳ `call_analyzer.py` only, not wired in |

## 📊 Example API Response

`POST /api/dispatch`:

```json
{
  "success": true,
  "phoneNumber": "+918319402171",
  "roomName": "call-918319402171-a1b2c3",
  "dispatchId": "SCL_abc123",
  "participantIdentity": "sip_+918319402171",
  "callId": "1702345678"
}
```

## 🚨 Troubleshooting

### Dashboard not loading?
```bash
cd dashboard
npm install
npm run dev
```

### Agent not connecting?
- Check `.env` file has all required variables
- Verify LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET

### Call not going through?
- Ensure phone number format: +91XXXXXXXXXX
- Check agent logs for errors
- Verify SIP trunk is configured in LiveKit

### Call history empty?
History is stored in your browser, so it is per-browser and per-device. A
different browser, a private window, or cleared site data all start empty.

## 📚 Full Documentation

For detailed information, see [DASHBOARD_SETUP.md](DASHBOARD_SETUP.md)

## 💡 Tips

1. **Test with your phone**: Give your own number to test end-to-end
2. **Customize prompts**: Each call can have different messaging
3. **Monitor logs**: Keep terminal windows visible to see real-time logs
4. **Save call data**: Use the CSV export button — history lives in your browser
5. **Inspect API**: Use DevTools to see network requests/responses

## 🎨 Dashboard Design

- **Minimalistic**: Clean interface, minimal text
- **Dark theme**: Easy on the eyes, modern look
- **Responsive**: Works on mobile and desktop
- **Fast**: Real-time updates without page refresh
- **Color-coded**: Status badges show call state at a glance

## 🔐 Important

⚠️ **Never share your `.env` file** - it contains API credentials
⚠️ **Keep API keys secret** - rotate them regularly
⚠️ **Don't commit `.env` to git** - add to `.gitignore`

## 🎯 Next Steps

After getting the dashboard running:

1. Make test calls to verify everything works
2. Customize call prompts for your use case
3. Review AI summaries and sentiment analysis
4. Export call data as needed
5. Integrate with your existing systems

## 📞 Example Workflows

### Recruitment
```
Prompt: "Hi! We have an exciting PM opportunity at TechCorp. 
Are you interested in hearing more?"
```

### Customer Feedback
```
Prompt: "Hi! We'd love to get your feedback on our recent update. 
Do you have 2 minutes?"
```

### Lead Follow-up
```
Prompt: "Hi! Following up on your inquiry about our AI platform. 
When would be a good time to chat?"
```

---

**Questions?** Check [DASHBOARD_SETUP.md](DASHBOARD_SETUP.md) for comprehensive documentation.

**Ready?** Start with `start_services.bat` (Windows) or `start_services.sh` (macOS/Linux)! 🚀





