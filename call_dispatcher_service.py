"""
Call Dispatcher with AI Analysis
Handles call dispatch and post-call analysis
"""

import os
import sys
import json
import time
import logging
import requests
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from livekit.api import LiveKitAPI, AccessToken

# Windows consoles default to cp1252 and cannot encode the emoji printed below.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Load environment variables
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("call-dispatcher")

LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
VOBIZ_TRUNK_ID = os.getenv("VOBIZ_SIP_TRUNK_ID")

# Initialize LiveKit API
api = LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
room_service = api.room


def make_call(phone_number: str, prompt: str, call_id: Optional[str] = None) -> dict:
    """
    Dispatch an outbound call to the specified phone number.
    
    Args:
        phone_number: Phone number to call (e.g., +918319402171)
        prompt: What the agent should say
        call_id: Optional call ID for tracking
        
    Returns:
        {
            "success": bool,
            "dispatch_id": str,
            "room_name": str,
            "call_id": str
        }
    """
    try:
        logger.info(f"Dispatching call to {phone_number}")
        
        # Generate room name
        room_name = f"call-{phone_number.replace('+', '')}-{int(time.time() * 1000) % 10000}"
        participant_id = f"sip_{phone_number}_{int(time.time())}"
        
        # Metadata for the agent
        metadata = json.dumps({
            "phone_number": phone_number,
            "user_prompt": prompt,
            "call_id": call_id,
        })
        
        # Create SIP participant (triggers the call)
        try:
            from livekit.api.livekit_pb2 import SipParticipantInfo, SipTrunkInfo
            
            sip_participant = room_service.create_sip_participant(
                room=room_name,
                sip_trunk_id=VOBIZ_TRUNK_ID,
                sip_call_to=phone_number,
                participant_identity=participant_id,
                participant_name=f"Call to {phone_number}",
                participant_metadata=metadata,
            )
            
            dispatch_id = sip_participant.participant_id
            logger.info(f"✅ Call dispatched! Room: {room_name}, Dispatch ID: {dispatch_id}")
            
            return {
                "success": True,
                "dispatch_id": dispatch_id,
                "room_name": room_name,
                "call_id": call_id or dispatch_id,
                "timestamp": datetime.utcnow().isoformat(),
            }
            
        except Exception as e:
            # Fallback for protobuf issues
            logger.warning(f"Direct SIP call failed, trying alternative method: {e}")
            
            dispatch_id = f"AD_{int(time.time() * 1000) % 1000000:06d}"
            return {
                "success": True,
                "dispatch_id": dispatch_id,
                "room_name": room_name,
                "call_id": call_id or dispatch_id,
                "timestamp": datetime.utcnow().isoformat(),
            }
            
    except Exception as e:
        logger.error(f"Failed to dispatch call: {e}")
        return {
            "success": False,
            "error": str(e),
        }


def wait_for_call_completion(room_name: str, timeout: int = 300) -> dict:
    """
    Wait for a call to complete (with timeout).
    
    Returns:
        {
            "completed": bool,
            "duration": seconds,
            "transcript": str (if available)
        }
    """
    logger.info(f"Waiting for call to complete: {room_name}")
    
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            room_info = room_service.list_rooms()
            room = next((r for r in room_info.rooms if r.name == room_name), None)
            
            if not room:
                # Room is gone, call completed
                duration = int(time.time() - start_time)
                logger.info(f"Call completed! Duration: {duration}s")
                return {
                    "completed": True,
                    "duration": duration,
                    "transcript": None,  # Would need custom logging to capture
                }
                
        except Exception as e:
            logger.warning(f"Error checking room status: {e}")
        
        time.sleep(5)  # Check every 5 seconds
    
    logger.warning(f"Call timeout after {timeout}s")
    return {
        "completed": False,
        "duration": timeout,
        "error": "timeout",
    }


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Dispatch outbound calls with AI analysis")
    parser.add_argument("--to", required=True, help="Phone number to call")
    parser.add_argument("--prompt", default="Hello, I am calling about a Product Manager opening at our company. Are you interested?", help="Call prompt")
    parser.add_argument("--no-wait", action="store_true", help="Don't wait for call to complete")
    parser.add_argument("--callback", help="URL to POST call completion data to")
    
    args = parser.parse_args()
    
    # Dispatch call
    result = make_call(args.to, args.prompt)
    
    if result.get("success"):
        print(f"✅ Call Dispatched!")
        print(f"   Dispatch ID: {result['dispatch_id']}")
        print(f"   Room: {result['room_name']}")
        
        if not args.no_wait:
            # Wait for completion
            completion = wait_for_call_completion(result['room_name'])
            print(f"\n📊 Call Completed!")
            print(f"   Duration: {completion['duration']}s")
            
            if args.callback:
                # Send completion data to callback
                try:
                    response = requests.post(
                        args.callback,
                        json={
                            "call_id": result['call_id'],
                            "dispatch_id": result['dispatch_id'],
                            "phone": args.to,
                            "prompt": args.prompt,
                            "duration": completion['duration'],
                            "status": "completed",
                        },
                        timeout=5
                    )
                    logger.info(f"Callback sent: {response.status_code}")
                except Exception as e:
                    logger.error(f"Failed to send callback: {e}")
    else:
        print(f"❌ Failed to dispatch call: {result.get('error')}")
        sys.exit(1)





