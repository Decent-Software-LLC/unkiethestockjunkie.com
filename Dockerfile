# syntax=docker/dockerfile:1

# Unkie The Stock Junkie - Jekyll build/serve environment.
# System Ruby on macOS is 2.6, which modern rouge (a Jekyll dependency) rejects.
# This image pins a supported Ruby so local preview matches what CI produces.

FROM ruby:3.3-slim

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    GEM_HOME=/usr/local/bundle \
    BUNDLE_PATH=/usr/local/bundle

# build-essential is needed for native gems (ffi, sass-embedded); curl for HEALTHCHECK.
# nodejs/npm + git let the content pipeline (scripts/*.js) run in the same container
# as the site build, so article generation and preview share one environment.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential curl ca-certificates git \
      nodejs npm ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/jekyll

COPY Gemfile Gemfile.lock* ./
RUN bundle config set without 'development test' \
 && bundle install

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://localhost:4000/ >/dev/null || exit 1

ENTRYPOINT ["tini", "--"]

# Default to serve; pass "build" to run a one-off production build.
CMD ["bundle", "exec", "jekyll", "serve", "--host", "0.0.0.0", "--livereload", "--force_polling", "--trace"]
