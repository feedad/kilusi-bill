# FreeRADIUS with PostgreSQL support
# Based on official FreeRADIUS Alpine image with libpq added

FROM freeradius/freeradius-server:latest-3.2-alpine

# Install PostgreSQL client library and utils (for radclient/radtest)
RUN apk add --no-cache libpq freeradius-utils

# The base image already has FreeRADIUS installed
# libpq provides libpq.so.5 needed by rlm_sql_postgresql
