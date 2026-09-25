FROM node:22 AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --include=dev
COPY . .

# Accept the API URL as a build argument so Vite can embed it
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine
ARG VITE_API_URL
# Copy the built React app
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config: SPA routing (React Router fallback to index.html) plus security
# headers. The Content-Security-Policy only lets the page talk to its own API,
# so the API/websocket origins are filled in from the same build argument.
COPY nginx.conf.tpl /tmp/nginx.conf.tpl
RUN API_URL="${VITE_API_URL:-http://localhost:4000/api/v1}"; \
    API_ORIGIN=$(echo "$API_URL" | sed -E 's#^(https?://[^/]+).*#\1#'); \
    WS_ORIGIN=$(echo "$API_ORIGIN" | sed -E 's#^http#ws#'); \
    sed -e "s#__API_ORIGIN__#$API_ORIGIN#g" -e "s#__WS_ORIGIN__#$WS_ORIGIN#g" /tmp/nginx.conf.tpl > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
