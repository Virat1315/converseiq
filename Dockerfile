FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code. .dockerignore keeps .env out — secrets are injected as
# environment variables at run time, never baked into a layer.
COPY . .

# Download the Silero VAD weights at build time. Otherwise the first call of
# every cold start pays for the download while the caller waits.
RUN python -c "from livekit.plugins import silero; silero.VAD.load()" || true

# The agent worker serves its health endpoint on 8081 (see worker.py), not 8080.
EXPOSE 8081

# Unbuffered so logs reach the platform as they happen rather than on flush.
ENV PYTHONUNBUFFERED=1

# Single worker per container: shedding load only helps when a sibling worker
# can take the job, and refusing it just drops the call. LiveKit Cloud manages
# capacity itself and logs that it is ignoring this — it applies to self-hosted
# Docker and to plain VPS runs.
ENV LIVEKIT_LOAD_THRESHOLD=1.0

# Run the agent
CMD ["python", "agent.py", "start"]
