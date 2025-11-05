FROM freeradius/freeradius-server:3.2.3

# Install dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    freeradius-utils \
    freeradius-postgresql \
    && rm -rf /var/lib/apt/lists/*

# Copy custom configuration
COPY config/ /etc/freeradius/3.0/
COPY mods-config/ /etc/freeradius/3.0/mods-config/

# Copy to main freeradius path (FreeRADIUS 3.2.3 uses this path)
COPY config/ /etc/freeradius/
COPY mods-config/ /etc/freeradius/mods-config/
COPY scripts/ /scripts/

# Set permissions
RUN chown -R freerad:freerad /etc/freeradius/3.0/
RUN mkdir -p /scripts && touch /scripts/.keep && chown -R freerad:freerad /scripts/

# Enable SQL module
RUN ln -sf /etc/freeradius/mods-available/sql /etc/freeradius/mods-enabled/sql

# Expose ports
EXPOSE 1812/udp 1813/udp 3799/udp

# Start FreeRADIUS in foreground
CMD ["freeradius", "-f", "-l", "/var/log/freeradius/radius.log"]