FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements-lock.txt backend/requirements-lock.txt
RUN pip install --no-cache-dir -r backend/requirements-lock.txt
COPY backend backend
ENV BRANDORA_ENV=production BRANDORA_DEMO=0
RUN useradd --create-home brandora && mkdir /app/data && chown -R brandora:brandora /app
USER brandora
EXPOSE 8200
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8200"]
