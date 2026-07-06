FROM python:3.12-slim AS backend

WORKDIR /app

COPY pyproject.toml README.md requirements.txt ./
COPY backend ./backend
RUN pip install --no-cache-dir .

FROM node:22-alpine AS frontend

WORKDIR /ui
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
RUN npm run build

FROM python:3.12-slim

WORKDIR /app
COPY --from=backend /usr/local /usr/local
COPY backend ./backend
COPY pyproject.toml README.md requirements.txt ./
COPY --from=frontend /ui/dist ./frontend/dist
RUN mkdir -p var/runtime var/output var/logs

EXPOSE 8091
CMD ["python", "-m", "pgsplit", "serve", "--host", "0.0.0.0", "--port", "8091"]
