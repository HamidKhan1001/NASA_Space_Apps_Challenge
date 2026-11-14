# The Atlas is a static site. This image exists only so it can also run as a
# Render web service (or anywhere else that wants a container). The preferred
# deployment is a Render Static Site or the render.yaml blueprint, which is free
# and CDN-backed; see README.md.
#
# Stage 1 assembles _site exactly as the Pages workflow does.
FROM python:3.11-slim AS build
WORKDIR /app
COPY . .
RUN chmod +x scripts/build-site.sh && ./scripts/build-site.sh

# Stage 2 serves it. nginx substitutes ${PORT} from the environment at start-up,
# which is how Render tells the container which port to listen on.
FROM nginx:1.27-alpine
ENV PORT=10000
COPY --from=build /app/_site /usr/share/nginx/html
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 10000
