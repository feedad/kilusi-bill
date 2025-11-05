# FreeRADIUS 3.2 with PostgreSQL support
# Optimized for production deployment with 2000+ customers

FROM ubuntu:22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV FREERADIUS_VERSION=3.2.5
ENV TZ=Asia/Jakarta

# Install dependencies
RUN apt-get update && apt-get install -y \
    freeradius \
    freeradius-postgresql \
    freeradius-utils \
    freeradius-common \
    postgresql-client \
    curl \
    htop \
    jq \
    wget \
    net-tools \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Set timezone
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Create necessary directories
RUN mkdir -p /etc/freeradius/3.0/mods-available \
    /etc/freeradius/3.0/mods-enabled \
    /etc/freeradius/3.0/sites-available \
    /etc/freeradius/3.0/sites-enabled \
    /etc/freeradius/3.0/certs \
    /var/log/freeradius \
    /var/run/freeradius \
    /opt/freeradius

# Copy configuration files
COPY config/ /etc/freeradius/3.0/
COPY scripts/ /opt/freeradius/scripts/
COPY docker/freeradius/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Set proper permissions
RUN chown -R freerad:freerad /etc/freeradius /var/log/freeradius /var/run/freeradius /opt/freeradius

# Expose RADIUS ports
EXPOSE 1812/udp 1813/udp 3799/udp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:18120/health || exit 1

# Start FreeRADIUS with supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]