#!/bin/bash
# Health check script for FreeRADIUS container
# Returns HTTP status for Docker health check

# Check if FreeRADIUS process is running
if ! pgrep -f "radiusd" > /dev/null; then
    echo "❌ FreeRADIUS process not running"
    exit 1
fi

# Check if database connection works
if [ -n "$DB_HOST" ] && [ -n "$DB_USER" ]; then
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        echo "✅ Database connection OK"
    else
        echo "❌ Database connection failed"
        exit 1
    fi
fi

# Check if RADIUS ports are listening
if netstat -uln | grep -q ":1812"; then
    echo "✅ RADIUS Auth port 1812 listening"
else
    echo "❌ RADIUS Auth port 1812 not listening"
    exit 1
fi

if netstat -uln | grep -q ":1813"; then
    echo "✅ RADIUS Acct port 1813 listening"
else
    echo "❌ RADIUS Acct port 1813 not listening"
    exit 1
fi

# Test local authentication
if command -v radtest >/dev/null 2>&1; then
    echo "✅ radtest command available"
    # Test with a dummy request (will fail but shows service is responding)
    if timeout 5 radtest test test123 localhost 1812 testing123 >/dev/null 2>&1; then
        echo "✅ RADIUS service responding"
    else
        echo "⚠️ RADIUS service not responding to test (may be expected)"
    fi
else
    echo "⚠️ radtest command not available"
fi

# Check recent log entries
if [ -f "/var/log/freeradius/radius.log" ]; then
    recent_errors=$(tail -n 100 /var/log/freeradius/radius.log | grep -i error | wc -l)
    if [ "$recent_errors" -eq 0 ]; then
        echo "✅ No recent errors in logs"
    else
        echo "⚠️ Found $recent_errors recent errors in logs"
    fi
else
    echo "⚠️ Log file not found"
fi

# Memory usage check
memory_usage=$(ps aux | grep radiusd | awk '{sum+=$6} END {print sum/1024}' | cut -d. -f1)
if [ "$memory_usage" -lt 100 ]; then
    echo "✅ Memory usage: ${memory_usage}MB (normal)"
elif [ "$memory_usage" -lt 500 ]; then
    echo "⚠️ Memory usage: ${memory_usage}MB (moderate)"
else
    echo "❌ Memory usage: ${memory_usage}MB (high)"
fi

# CPU usage check
cpu_usage=$(ps aux | grep radiusd | awk '{sum+=$3} END {print sum}' | cut -d. -f1)
total_cores=$(nproc)
cpu_percent=$((cpu_usage / total_cores / 100))
if [ "$cpu_percent" -lt 50 ]; then
    echo "✅ CPU usage: ${cpu_percent}% (normal)"
elif [ "$cpu_percent" -lt 80 ]; then
    echo "⚠️ CPU usage: ${cpu_percent}% (moderate)"
else
    echo "❌ CPU usage: ${cpu_percent}% (high)"
fi

echo "✅ Health check completed"
exit 0