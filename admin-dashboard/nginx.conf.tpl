server {
    listen 80;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), usb=(self), serial=(self)" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://checkout.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' __API_ORIGIN__ __WS_ORIGIN__ https://api.razorpay.com https://lumberjack.razorpay.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;

    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }
}
