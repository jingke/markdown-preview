FROM node:24-bookworm-slim

WORKDIR /app

ENV NPM_CONFIG_FETCH_RETRIES=10
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
ENV NPM_CONFIG_MAXSOCKETS=1

COPY package.json package-lock.json ./
RUN set -eux; \
  attempt=1; \
  max=5; \
  while [ "$attempt" -le "$max" ]; do \
    if npm ci --no-audit --fund=false; then \
      break; \
    fi; \
    if [ "$attempt" -eq "$max" ]; then \
      exit 1; \
    fi; \
    echo "npm ci failed, retry $attempt/$max in $((attempt * 10))s..."; \
    sleep $((attempt * 10)); \
    attempt=$((attempt + 1)); \
  done

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
