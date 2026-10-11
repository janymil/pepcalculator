# The sync server only. The app itself is static files and belongs on any host.
#
#   docker build -t pepcalculator-sync .
#   docker run -d -p 8787:8787 -v sync-data:/data \
#     -e ALLOWED_ORIGIN=https://your-app.example pepcalculator-sync
#
# There is no `npm install` step: the server is **zero-dependency** (Node built-ins
# only), so this image is the runtime plus three files.
FROM node:22-alpine

WORKDIR /app

# `server/guard.mjs` holds the origin rule and the rate limiter, `server.mjs` the
# wiring. Nothing else is needed at runtime.
COPY server/guard.mjs server/server.mjs ./

# The database is *data*, so it lives on a volume rather than in the image.
# `node:sqlite` prints an experimental warning; the npm script silences it and so
# does this, so the logs stay a readable request log.
ENV PORT=8787 \
    DB_PATH=/data/sync.sqlite

RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

USER node

EXPOSE 8787

# The image has node but not curl, so the check uses node itself.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
