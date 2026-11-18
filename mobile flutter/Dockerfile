# SuperAgent mobile frontend — builds the Flutter WEB version and serves it with nginx.
# Lean build: installs only the Flutter SDK + web tooling (no Android SDK, small download).
#
# Build:  docker build -t superagent .
# Run:    docker run --rm -p 8080:80 superagent   ->  http://localhost:8080

FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl unzip xz-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 -b stable https://github.com/flutter/flutter.git /flutter
ENV PATH="/flutter/bin:${PATH}"
RUN git config --global --add safe.directory /flutter \
    && flutter config --no-analytics --enable-web \
    && flutter precache --web
WORKDIR /app
COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get
COPY . .
RUN flutter build web --release --no-web-resources-cdn

FROM nginx:alpine
ENV API_UPSTREAM=http://host.docker.internal:3000
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/build/web /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
