#!/usr/bin/env bash

podman build -t watsonx-batchml-api-dev -f Dockerfile-dev .

source ./.env

podman create network watsonx-batchml 1> /dev/null 2> /dev/null
podman rm watsonx-batchml-api 1> /dev/null 2> /dev/null

echo "Starting container: watsonx-batchml-api"

podman run -it \
  --name watsonx-batchml-api \
  --volume ${PWD}:/opt/app-root/dev \
  --net watsonx-batchml \
  --publish 3000:3000 \
  --memory 16g \
  --env "MONGODB_CONNECT_STRING=${MONGODB_CONNECT_STRING}" \
  --env "MONGODB_USERNAME=${MONGODB_USERNAME}" \
  --env "MONGODB_PASSWORD=${MONGODB_PASSWORD}" \
  --env "MONGODB_DATABASE_NAME=${MONGODB_DATABASE_NAME}" \
  --env "MONGODB_CERTIFICATE_BASE64=${MONGODB_CERTIFICATE_BASE64}" \
  --env "WML_API_KEY=${WML_API_KEY}" \
  --env "WML_ENDPOINT=${WML_ENDPOINT}" \
  --env "WML_IDENTITY_URL=${WML_IDENTITY_URL}" \
  --env "WML_VERSION=${WML_VERSION}" \
  --env "WML_DEFAULT_DEPLOYMENT_ID=${WML_DEFAULT_DEPLOYMENT_ID}" \
  --env "WML_DEFAULT_DEPLOYMENT_FIELDS=${WML_DEFAULT_DEPLOYMENT_FIELDS}" \
  watsonx-batchml-api-dev
