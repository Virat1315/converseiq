import os
import certifi

# Fix for macOS SSL Certificate errors - MUST be before other imports
os.environ['SSL_CERT_FILE'] = certifi.where()

import asyncio
import logging
import json
from datetime import datetime, timezone
from dotenv import load_dotenv

from livekit import agents, api
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.plugins import (
    openai,
    cartesia,
    deepgram,
    noise_cancellation,
    silero,
    sarvam,
)
from livekit.agents import llm
from typing import Annotated, Optional

# Load environment variables
load_dotenv(".env")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("outbound-agent")

import config

# TRUNK ID - Now loaded from config.py
# You can find this by running 'python setup_trunk.py --list' or checking LiveKit Dashboard 


def _build_tts(config_provider: str = None, config_voice: str = None, config_language: str = None):
    """Configure the Text-to-Speech provider based on env vars or dynamic config."""
    # Priority: Config > Env Var > Default
    provider = (config_provider or os.getenv("TTS_PROVIDER", config.DEFAULT_TTS_PROVIDER)).lower()
    
    # If using Sarvam Voice names (Anushka/Aravind), force Sarvam provider
    if config_voice in ["anushka", "aravind", "amartya", "dhruv"]:
        provider = "sarvam"

    if provider == "cartesia":
        logger.info("Using Cartesia TTS")
        model = os.getenv("CARTESIA_TTS_MODEL", config.CARTESIA_MODEL)
        voice = os.getenv("CARTESIA_TTS_VOICE", config.CARTESIA_VOICE)
        return cartesia.TTS(model=model, voice=voice)
    
    if provider == "sarvam":
        logger.info(f"Using Sarvam TTS (Voice: {config_voice})")
        model = os.getenv("SARVAM_TTS_MODEL", config.SARVAM_MODEL)
        # Use dynamic voice or env var or default
        voice = config_voice or os.getenv("SARVAM_VOICE", "anushka")
        # The campaign's language wins: it is what the agent offered the
        # candidate, so the voice has to be able to speak it.
        language = config_language or os.getenv("SARVAM_LANGUAGE", config.SARVAM_LANGUAGE)
        logger.info(f"Sarvam TTS language: {language}")
        return sarvam.TTS(model=model, speaker=voice, target_language_code=language)

    if provider == "deepgram":
        logger.info("Using Deepgram TTS")
        model = os.getenv("DEEPGRAM_TTS_MODEL", "aura-asteria-en")
        return deepgram.TTS(model=model)

    # Default to OpenAI
    logger.info(f"Using OpenAI TTS (Voice: {config_voice})")
    model = os.getenv("OPENAI_TTS_MODEL", "tts-1")
    voice = config_voice or os.getenv("OPENAI_TTS_VOICE", config.DEFAULT_TTS_VOICE)
    return openai.TTS(model=model, voice=voice)


def _build_llm(config_provider: str = None):
    """Configure the LLM provider based on config or env vars."""
    provider = (config_provider or os.getenv("LLM_PROVIDER", config.DEFAULT_LLM_PROVIDER)).lower()

    if provider == "groq":
        logger.info("Using Groq LLM")
        return openai.LLM(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY"),
            model=os.getenv("GROQ_MODEL", config.GROQ_MODEL),
            temperature=float(os.getenv("GROQ_TEMPERATURE", str(config.GROQ_TEMPERATURE))),
        )
    
    # Default to OpenAI
    logger.info("Using OpenAI LLM")
    return openai.LLM(model=config.DEFAULT_LLM_MODEL)



class CallTools(llm.ToolContext):
    def __init__(self, ctx: agents.JobContext, phone_number: str = None, base_metadata: dict = None):
        super().__init__(tools=[])
        self.ctx = ctx
        self.phone_number = phone_number
        self.base_metadata = base_metadata or {}
        self.submitted = False
        # Every line spoken, in order. Four numbers are not enough to trust a
        # score - whoever reads the shortlist needs to see what was actually said.
        self.transcript: list[dict] = []

    def record_line(self, role: str, text: str):
        text = (text or "").strip()
        if not text:
            return
        self.transcript.append(
            {
                "role": "agent" if role == "assistant" else "candidate",
                "text": text,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )

    async def _publish(self, extra: dict) -> bool:
        """Merge into the room metadata the dashboard already polls."""
        merged = dict(self.base_metadata)
        merged.update(extra)
        try:
            await self.ctx.api.room.update_room_metadata(
                api.UpdateRoomMetadataRequest(
                    room=self.ctx.room.name,
                    metadata=json.dumps(merged),
                )
            )
            return True
        except Exception as e:
            logger.error(f"Failed to publish call data: {e}")
            return False

    async def flush_transcript(self):
        """
        Publish the transcript even when the call ended without a submission -
        a candidate who hangs up halfway still leaves something worth reading.
        """
        if not self.transcript or self.submitted:
            return
        logger.info(f"Flushing partial transcript ({len(self.transcript)} lines)")
        await self._publish({"transcript": self.transcript, "partial": True})

    @llm.function_tool(
        description=(
            "Record the candidate's screening answers. Call this exactly once, after the last "
            "question is answered, or immediately if the candidate says they are not interested. "
            "Leave a field out if the candidate genuinely did not answer that question — never guess. "
            "top_skills must be the skills the candidate named, in their own words, and notes should "
            "carry the background they described."
        )
    )
    async def submit_screening(
        self,
        interested: bool,
        years_experience: Optional[float] = None,
        top_skills: Optional[list[str]] = None,
        expected_salary_lpa: Optional[float] = None,
        open_to_relocation: Optional[bool] = None,
        notice_period_days: Optional[int] = None,
        notes: Optional[str] = None,
    ):
        """
        Publish the answers onto the room metadata.

        The dashboard already polls room state for live call status, so writing
        here means results reach it with no extra webhook, no database, and
        nothing to configure — it works identically on localhost and Vercel.
        """
        if self.submitted:
            logger.info("submit_screening called twice; ignoring the second call.")
            return "Already recorded."

        answers = {
            "interested": interested,
            "yearsExperience": years_experience,
            # Kept verbatim. The dashboard matches these against the role's
            # desired skills; rewording them here would bias that match.
            "topSkills": [s.strip() for s in (top_skills or []) if s and s.strip()] or None,
            "expectedSalaryLpa": expected_salary_lpa,
            "openToRelocation": open_to_relocation,
            "noticePeriodDays": notice_period_days,
            "notes": notes,
            "capturedAt": datetime.now(timezone.utc).isoformat(),
        }
        logger.info(f"Screening answers captured: {answers}")

        # Merge, don't replace — the room metadata also carries the prompt and
        # phone number that the dashboard wrote when it created the room.
        if not await self._publish({"screening": answers, "transcript": self.transcript}):
            return "Could not save the answers, but continue and end the call politely."
        self.submitted = True

        # Don't leave the line open once there is nothing left to ask — an idle
        # SIP leg is billed like any other.
        asyncio.create_task(self._end_call_after(12))
        return "Recorded. Thank the candidate briefly and end the call."

    async def _end_call_after(self, seconds: int):
        await asyncio.sleep(seconds)
        logger.info("Screening complete; ending call.")
        self.ctx.shutdown()

    @llm.function_tool(description="Transfer the call to a human support agent or another phone number.")
    async def transfer_call(self, destination: Optional[str] = None):
        """
        Transfer the call.
        """
        if destination is None:
            destination = config.DEFAULT_TRANSFER_NUMBER
            if not destination:
                 return "Error: No default transfer number configured."
        if "@" not in destination:
            # If no domain is provided, append the SIP domain
            if config.SIP_DOMAIN:
                # Ensure clean number (strip tel: or sip: prefix if present but no domain)
                clean_dest = destination.replace("tel:", "").replace("sip:", "")
                destination = f"sip:{clean_dest}@{config.SIP_DOMAIN}"
            else:
                # Fallback to tel URI if no domain configured
                if not destination.startswith("tel:") and not destination.startswith("sip:"):
                     destination = f"tel:{destination}"
        elif not destination.startswith("sip:"):
             destination = f"sip:{destination}"
        
        logger.info(f"Transferring call to {destination}")
        
        # Determine the participant identity
        # For outbound calls initiated by this agent, the participant identity is typically "sip_<phone_number>"
        # For inbound, we might need to find the remote participant.
        participant_identity = None
        
        # If we stored the phone number from metadata, we can construct the identity
        if self.phone_number:
            participant_identity = f"sip_{self.phone_number}"
        else:
            # Try to find a participant that is NOT the agent
            for p in self.ctx.room.remote_participants.values():
                participant_identity = p.identity
                break
        
        if not participant_identity:
            logger.error("Could not determine participant identity for transfer")
            return "Failed to transfer: could not identify the caller."

        try:
            logger.info(f"Transferring participant {participant_identity} to {destination}")
            await self.ctx.api.sip.transfer_sip_participant(
                api.TransferSIPParticipantRequest(
                    room_name=self.ctx.room.name,
                    participant_identity=participant_identity,
                    transfer_to=destination,
                    play_dialtone=False
                )
            )
            return "Transfer initiated successfully."
        except Exception as e:
            logger.error(f"Transfer failed: {e}")
            return f"Error executing transfer: {e}"


class OutboundAssistant(Agent):
    """
    An AI agent tailored for outbound calls.

    The dashboard sends a per-campaign screening script in the room metadata.
    config.SYSTEM_PROMPT is only the fallback for CLI-placed calls.
    """
    def __init__(self, tools: list, instructions: str = None) -> None:
        super().__init__(
            instructions=instructions or config.SYSTEM_PROMPT,
            tools=tools,
        )




async def entrypoint(ctx: agents.JobContext):
    """
    Main entrypoint for the agent.
    
    For outbound calls:
    1. Checks for 'phone_number' in the job metadata.
    2. Connects to the room.
    3. Initiates the SIP call to the phone number.
    4. Waits for answer before speaking.
    """
    logger.info(f"Connecting to room: {ctx.room.name}")
    
    # parse the phone number AND config from the metadata
    phone_number = None
    config_dict = {}
    
    # Check Job Metadata (Legacy/Dispatch)
    try:
        if ctx.job.metadata:
            data = json.loads(ctx.job.metadata)
            phone_number = data.get("phone_number")
            config_dict = data
    except Exception:
        pass
        
    # Check Room Metadata (Dashboard/Route.ts) - Overrides Job Metadata if present
    try:
        if ctx.room.metadata:
            data = json.loads(ctx.room.metadata)
            if data.get("phone_number"):
                phone_number = data.get("phone_number")
            config_dict.update(data) # Merge configs
    except Exception:
        logger.warning("No valid JSON metadata found in Room.")

    # The dashboard builds the screening script from the campaign criteria and
    # sends it here; `user_prompt` is the free-text fallback for CLI calls.
    instructions = config_dict.get("screening_instructions") or config_dict.get("user_prompt") or None

    # Initialize function context
    fnc_ctx = CallTools(ctx, phone_number, base_metadata=config_dict)

    # A hang-up mid-call still leaves a readable transcript behind.
    ctx.add_shutdown_callback(fnc_ctx.flush_transcript)

    # Initialize the Agent Session with plugins
    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(model=config.STT_MODEL, language=config.STT_LANGUAGE), 
        llm=_build_llm(config_dict.get("model_provider")),
        tts=_build_tts(
            config_dict.get("model_provider"),
            config_dict.get("voice_id"),
            config_dict.get("language"),
        ),
    )

    @session.on("conversation_item_added")
    def _on_item(ev):
        # Fires for each completed turn on both sides. AgentHandoff items have
        # no text_content, so guard rather than assume a ChatMessage.
        item = getattr(ev, "item", None)
        text = getattr(item, "text_content", None)
        if text:
            fnc_ctx.record_line(getattr(item, "role", "assistant"), text)

    # Start the session
    await session.start(
        room=ctx.room,
        agent=OutboundAssistant(
            tools=list(fnc_ctx.function_tools.values()),
            instructions=instructions,
        ),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVCTelephony(),
            close_on_disconnect=True, # Close room when agent disconnects
        ),
    )

    # Logic to dial out:
    # 1. If 'phone_number' is present, we MIGHT need to dial.
    # 2. Check if a SIP participant is already in the room (Dashboard dispatch case).
    
    # The dashboard dials the number itself and sets agent_dials=False. It
    # dispatches this agent *before* dialling so we are already in the room when
    # the callee picks up, which means the room is legitimately empty right now.
    # Without this flag we would read that emptiness as "nobody called yet" and
    # dial the same number a second time.
    dispatcher_dials = config_dict.get("agent_dials", True) is False

    should_dial = False
    if phone_number and not dispatcher_dials:
        # Check if any remote participant looks like our user (sip_PHONE)
        user_already_here = False
        for p in ctx.room.remote_participants.values():
            if f"sip_{phone_number}" in p.identity or "sip_" in p.identity:
                user_already_here = True
                break

        if not user_already_here:
            should_dial = True
            logger.info("User not in room. Agent will initiate dial-out.")
        else:
            logger.info("User already in room. Greeting only.")

    if should_dial:
        logger.info(f"Initiating outbound SIP call to {phone_number}...")
        try:
            # Create a SIP participant to dial out
            # This effectively "calls" the phone number and brings them into this room
            # --- CONNECTING TO THE PHONE NETWORK ---
            # This step actually "dials" the number using Vobiz (SIP Trunk).
            # It invites the phone number into this digital room.
            await ctx.api.sip.create_sip_participant(
                api.CreateSIPParticipantRequest(
                    room_name=ctx.room.name,
                    sip_trunk_id=config.SIP_TRUNK_ID,
                    sip_call_to=phone_number,
                    participant_identity=f"sip_{phone_number}", # Unique ID for the SIP user
                    wait_until_answered=True, # Important: Wait for pickup before continuing
                )
            )
            logger.info("Call answered! Agent is now listening.")
            
            # Note: We do NOT generate an initial reply here immediately.
            # Usually for outbound, we want to hear "Hello?" from the user first,
            # OR we can speak immediately. 
            # If you want the agent to speak first, uncomment the lines below:
            
            await session.generate_reply(
                instructions=config.INITIAL_GREETING
            )
            
        except Exception as e:
            logger.error(f"Failed to place outbound call: {e}")
            # Ensure we clean up if the call fails
            ctx.shutdown()
    elif dispatcher_dials:
        # The phone is ringing but nobody has answered yet. Greeting now would
        # play the introduction into an empty room and the callee would hear
        # nothing but silence when they finally pick up.
        logger.info("Waiting for the callee to answer...")
        try:
            participant = await asyncio.wait_for(ctx.wait_for_participant(), timeout=90)
            logger.info(f"Callee joined ({participant.identity}). Greeting.")
            # Defer to the OPENING section of the campaign script rather than a
            # generic greeting here — that is where the candidate's name, the
            # role, and the English-or-Hindi question live.
            await session.generate_reply(
                instructions=(
                    "The candidate has just answered the phone. Deliver your OPENING "
                    "exactly as your instructions describe, then wait for their reply."
                )
            )
        except asyncio.TimeoutError:
            logger.warning("Callee never answered within 90s. Ending the job.")
            ctx.shutdown()
    else:
        # Inbound calls, or a room the user was already sitting in.
        logger.info("Participant already present. Greeting immediately.")
        await session.generate_reply(instructions=config.fallback_greeting)


if __name__ == "__main__":
    # `agent.py start` runs in production mode, where the worker refuses jobs
    # once machine load passes 0.7. On a laptop that is also running the
    # dashboard and a browser, baseline load already sits near that line, so the
    # worker flaps in and out of availability and LiveKit has nobody to give the
    # job to — the phone rings and the caller hears silence.
    #
    # Raise it (1.0 disables the gate) when the box is dedicated to one worker.
    # Shedding load only helps if another worker can pick the job up; with a
    # single worker, refusing it just drops the call.
    load_threshold = float(os.getenv("LIVEKIT_LOAD_THRESHOLD", "1.0"))
    logger.info(f"Worker load threshold: {load_threshold}")

    # The agent name "outbound-caller" is used by the dispatch script to find this worker
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="outbound-caller",
            load_threshold=load_threshold,
        )
    )





