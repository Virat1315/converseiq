import os
from dotenv import load_dotenv

load_dotenv()

# =========================================================================================
#  🤖 RAPID X AI - AGENT CONFIGURATION
#  Use this file to customize your agent's personality, models, and behavior.
# =========================================================================================

# --- 1. AGENT PERSONA & PROMPTS ---
# Fallback script for CLI-placed calls. The dashboard overrides this per
# campaign via `screening_instructions` in the room metadata — edit the
# campaign there rather than here.
SYSTEM_PROMPT = """
You are a screening assistant calling candidates about a Product Manager role.

Your ONLY job is to ask the four questions below, in order, and record the answers.

1. How many years of relevant experience do you have?
2. What is your expected annual salary, in lakhs per annum?
3. Are you open to relocating for this role?
4. What is your notice period, and how soon could you start?

RULES - follow these exactly:
- Ask ONE question at a time. Wait for the answer before asking the next.
- Keep every message to one short sentence. This is a phone call, not an essay.
- Do NOT answer questions about salary bands, benefits, interview rounds, the team,
  or the company. Say "I'm only collecting a few details right now - the recruiter
  will cover that" and continue with your next question.
- Do NOT invent details about the role, the company, or the process.
- Do NOT give feedback on their answers, and never tell them their score or whether
  they qualify.
- If they are not interested, thank them, call submit_screening with interested=false,
  and end the call.
- If they ask to speak to a human, use transfer_call.
- Once all four questions are answered, call submit_screening with everything you
  collected, thank them briefly, and end the call.

Speak English, or Hindi if they do.
"""

# The explicit first message the agent speaks when the candidate picks up.
INITIAL_GREETING = (
    "The candidate has picked up. In one sentence, say you are calling about the role "
    "and ask if they have a minute for a few quick questions. Do not list the questions."
)

# If the call is inbound, or the participant was already in the room:
fallback_greeting = INITIAL_GREETING


# --- 2. SPEECH-TO-TEXT (STT) SETTINGS ---
# We use Deepgram for high-speed transcription.
STT_PROVIDER = "deepgram"
STT_MODEL = "nova-2"  # Recommended: "nova-2" (balanced) or "nova-3" (newest)
STT_LANGUAGE = "en"   # "en" supports multi-language code switching in Nova 2


# --- 3. TEXT-TO-SPEECH (TTS) SETTINGS ---
# Choose your voice provider: "openai", "sarvam" (Indian voices), or "cartesia" (Ultra-fast)
DEFAULT_TTS_PROVIDER = "openai" 
DEFAULT_TTS_VOICE = "alloy"      # OpenAI: alloy, echo, shimmer | Sarvam: anushka, aravind

# Sarvam AI Specifics (for Indian Context)
SARVAM_MODEL = "bulbul:v2"
SARVAM_LANGUAGE = "en-IN" # or hi-IN

# Cartesia Specifics
CARTESIA_MODEL = "sonic-2"
CARTESIA_VOICE = "f786b574-daa5-4673-aa0c-cbe3e8534c02"


# --- 4. LARGE LANGUAGE MODEL (LLM) SETTINGS ---
# Choose "openai" or "groq"
DEFAULT_LLM_PROVIDER = "openai"
DEFAULT_LLM_MODEL = "gpt-4o-mini" # OpenAI default

# Groq Specifics (Faster inference)
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_TEMPERATURE = 0.7


# --- 5. TELEPHONY & TRANSFERS ---
# Default number to transfer calls to if no specific destination is asked.
DEFAULT_TRANSFER_NUMBER = os.getenv("DEFAULT_TRANSFER_NUMBER")

# Vobiz Trunk Details (Loaded from .env usually, but you can hardcode if needed)
SIP_TRUNK_ID = os.getenv("VOBIZ_SIP_TRUNK_ID")
SIP_DOMAIN = os.getenv("VOBIZ_SIP_DOMAIN")





