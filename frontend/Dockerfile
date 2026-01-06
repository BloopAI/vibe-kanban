# Simple nginx container serving pre-built dist
# Build happens locally via deploy.py, not in Docker
FROM nginx:alpine

# Copy pre-built dist files (built by deploy.py before railway up)
COPY dist/ /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
