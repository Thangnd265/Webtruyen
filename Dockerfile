FROM python:3.12-slim

WORKDIR /app

# Install python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy application source code
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/

ENV PYTHONUNBUFFERED=1
ENV PORT=3080
ENV HOST=0.0.0.0
ENV AUDIOBOOKS_DIR=/mnt/gdrive/audiobooks
ENV KOSYNC_URL=http://kosync:3000

EXPOSE 3080

CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-3080}"]
