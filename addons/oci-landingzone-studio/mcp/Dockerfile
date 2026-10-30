FROM --platform=$BUILDPLATFORM golang:1.26.10-bookworm@sha256:23ce71337b726608afb1bc00986e630a05034a87a87ea1fc2cd1ae5cf33387eb AS go
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
COPY --from=go /usr/local/go /usr/local/go
COPY --from=go /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
ENV PATH="/usr/local/go/bin:${PATH}"
WORKDIR /workspace/addons/oci-landingzone-studio
COPY addons/oci-landingzone-studio/mcp/package*.json ./mcp/
RUN cd mcp && npm ci --ignore-scripts --registry=https://registry.npmjs.org --no-audit --no-fund
RUN ln -s mcp/node_modules node_modules
COPY addons/oci-landingzone-studio/3rd ./3rd
RUN bash 3rd/go-jsonnet/ensure.sh
COPY gen /workspace/gen
COPY addons/oci-landingzone-studio/src ./src
COPY addons/oci-landingzone-studio/mcp ./mcp
WORKDIR /workspace/addons/oci-landingzone-studio/mcp
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c
LABEL org.opencontainers.image.title="OCI Landing Zone Studio MCP" \
      org.opencontainers.image.licenses="UPL-1.0"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /workspace/addons/oci-landingzone-studio/mcp/dist ./dist
COPY --from=build /workspace/addons/oci-landingzone-studio/mcp/node_modules ./node_modules
COPY addons/oci-landingzone-studio/mcp/client.mjs addons/oci-landingzone-studio/mcp/smoke.mjs ./
COPY addons/oci-landingzone-studio/3rd/go-jsonnet/public/third-party ./third-party
COPY LICENSE.txt ./LICENSE.txt
USER 1000:1000
EXPOSE 8443 8081
CMD ["node", "dist/server.mjs"]
