/**
 * Local IP Restriction Middleware
 * Hanya mengizinkan akses dari subnet lokal: 172.22.10.0/24, 192.168.99.0/24, localhost
 */
function localIpOnly(req, res, next) {
    const clientIp = (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '')
        .replace('::ffff:', '');

    const allowedPrefixes = ['172.22.10.', '192.168.99.', '127.0.0.1', '::1'];

    if (!allowedPrefixes.some(prefix => clientIp.startsWith(prefix))) {
        return res.status(403).json({
            success: false,
            message: 'Access denied: local network only'
        });
    }

    next();
}

module.exports = localIpOnly;
