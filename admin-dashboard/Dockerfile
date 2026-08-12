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
# Copy the built React app
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom Nginx configuration to support SPA routing (React Router fallback to index.html)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
