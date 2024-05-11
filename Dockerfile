FROM registry.access.redhat.com/ubi9/nodejs-18:1-108.1714669798 AS builder
# https://catalog.redhat.com/software/containers/ubi9/nodejs-18/62e8e7ed22d1d3c2dfe2ca01

WORKDIR /opt/app-root/src

COPY --chown=default:root . .

RUN mkdir -p /opt/app-root/src/node_modules && \
    ls -lA && \
    npm ci && \
    npm run build

FROM registry.access.redhat.com/ubi9/nodejs-18-minimal:1-113.1714664725
# https://catalog.redhat.com/software/containers/ubi9/nodejs-18-minimal/62e8e919d4f57d92a9dee838

## Uncomment the below lines to update image security content if any
# USER root
# RUN dnf -y update-minimal --security --sec-severity=Important --sec-severity=Critical && dnf clean all

LABEL name="ibm/template-node-typescript" \
      vendor="IBM" \
      version="1" \
      release="113" \
      summary="This is an example of a container image." \
      description="This container image will deploy a Typescript Node App"

WORKDIR /opt/app-root/src

COPY --from=builder --chown=1001:root /opt/app-root/src/dist dist

COPY --chown=1001:root package*.json ./

RUN ls -lA && \
    mkdir -p /opt/app-root/src/node_modules && \
    npm ci --only=production

COPY --chown=1001:root licenses licenses
COPY --chown=1001:root public public
# COPY --chown=1001:root licenses /licenses

ENV HOST=0.0.0.0 PORT=3000

EXPOSE 3000/tcp

CMD ["npm", "run", "start"]

