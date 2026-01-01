const jwt = require('jsonwebtoken');

const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'your-customer-jwt-secret-key-change-in-production';

// JWT middleware for Customer Portal API routes
// Uses CUSTOMER_JWT_SECRET instead of admin JWT_SECRET
function customerJwtAuth(req, res, next) {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        console.log('🔑 CustomerJwtAuth: Auth header present:', !!authHeader);

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('❌ CustomerJwtAuth: No valid Authorization header');
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        console.log('🔑 CustomerJwtAuth: Token extracted, length:', token.length);

        // Verify token using customer secret
        const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);
        console.log('✅ CustomerJwtAuth: Token verified, decoded:', JSON.stringify(decoded));

        // Attach customer info to request
        // Customer tokens use 'customerId' for customer ID (not 'id')
        req.user = {
            id: decoded.customerId || decoded.id,
            customerId: decoded.customerId || decoded.id,
            phone: decoded.phone,
            serviceId: decoded.serviceId || null
        };
        console.log('✅ CustomerJwtAuth: req.user set:', JSON.stringify(req.user));

        next();
    } catch (error) {
        console.log('❌ CustomerJwtAuth: Error:', error.name, error.message);

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
}

module.exports = { customerJwtAuth };

