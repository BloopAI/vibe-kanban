# Simple nginx container serving pre-built dist
# Build happens locally via deploy.py, not in Docker
FROM nginx:alpine

# Copy pre-built dist files (built by deploy.py before railway up)
COPY dist/ /usr/share/nginx/html

# Copy nginx config as template (allows ${PORT} substitution)
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

# nginx:alpine automatically runs envsubst on .template files at startup
CMD ["nginx", "-g", "daemon off;"]
