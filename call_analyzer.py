"""
Call Analysis Service
Analyzes completed calls and generates summaries with sentiment analysis.
"""

import os
import json
import logging
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from openai import OpenAI

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("call-analyzer")

app = Flask(__name__)

# Initialize OpenAI client (using Groq)
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
)

CALLS_DB = Path("data/calls.json")


def load_calls():
    """Load calls from JSON file."""
    if CALLS_DB.exists():
        with open(CALLS_DB, "r") as f:
            return json.load(f)
    return []


def save_calls(calls):
    """Save calls to JSON file."""
    CALLS_DB.parent.mkdir(parents=True, exist_ok=True)
    with open(CALLS_DB, "w") as f:
        json.dump(calls, f, indent=2)


def generate_call_summary(transcript: str, prompt: str) -> dict:
    """
    Use AI to generate a summary and sentiment analysis of the call.
    
    Returns:
        {
            "summary": "...",
            "sentiment": "Positive/Neutral/Negative",
            "key_points": ["...", "..."],
            "duration_estimate": seconds
        }
    """
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": """You are an AI assistant that analyzes phone call transcripts. 
                    Provide analysis in JSON format with the following fields:
                    - summary: A brief 2-3 sentence summary of what happened in the call
                    - sentiment: One of: Positive, Neutral, Negative (based on the user's tone/response)
                    - key_points: A list of 2-3 key points from the conversation
                    - outcome: What was the outcome of the call (e.g., "Interested", "Not interested", "Need to follow up")
                    """,
                },
                {
                    "role": "user",
                    "content": f"""Analyze this call transcript and provide insights:
                    
                    Call Prompt: {prompt}
                    
                    Transcript:
                    {transcript if transcript else "Call was not recorded or transcript unavailable."}
                    
                    Provide response as valid JSON only, no markdown formatting.""",
                },
            ],
            temperature=0.5,
        )

        # Parse the response
        try:
            result = json.loads(response.choices[0].message.content)
            return result
        except json.JSONDecodeError:
            # If response isn't valid JSON, create a basic summary
            return {
                "summary": response.choices[0].message.content[:200],
                "sentiment": "Neutral",
                "key_points": ["Call was made"],
                "outcome": "Unknown",
            }

    except Exception as e:
        logger.error(f"Error generating summary: {e}")
        return {
            "summary": "Unable to generate summary",
            "sentiment": "Unknown",
            "key_points": [],
            "outcome": "Error",
        }


@app.route("/api/analyze", methods=["POST"])
def analyze_call():
    """
    Analyze a completed call.
    
    Expected payload:
    {
        "call_id": "...",
        "transcript": "...",
        "prompt": "...",
        "duration": seconds
    }
    """
    try:
        data = request.json
        call_id = data.get("call_id")
        transcript = data.get("transcript", "")
        prompt = data.get("prompt", "")
        duration = data.get("duration", 0)

        if not call_id:
            return jsonify({"error": "call_id required"}), 400

        # Generate analysis
        analysis = generate_call_summary(transcript, prompt)

        # Update call record
        calls = load_calls()
        for call in calls:
            if call.get("id") == call_id:
                call.update(
                    {
                        "status": "completed",
                        "summary": analysis.get("summary"),
                        "sentiment": analysis.get("sentiment"),
                        "outcome": analysis.get("outcome"),
                        "key_points": analysis.get("key_points", []),
                        "duration": duration,
                        "transcript": transcript[:500],  # Store first 500 chars
                        "analyzed_at": datetime.utcnow().isoformat(),
                    }
                )
                save_calls(calls)
                logger.info(f"Call {call_id} analyzed successfully")
                return jsonify({"success": True, "analysis": analysis})

        return jsonify({"error": "Call not found"}), 404

    except Exception as e:
        logger.error(f"Error analyzing call: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/calls/<call_id>", methods=["GET"])
def get_call(call_id):
    """Get a specific call record."""
    calls = load_calls()
    for call in calls:
        if call.get("id") == call_id:
            return jsonify(call)
    return jsonify({"error": "Call not found"}), 404


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "call-analyzer"})


if __name__ == "__main__":
    logger.info("Starting Call Analysis Service...")
    app.run(host="0.0.0.0", port=5000, debug=False)





