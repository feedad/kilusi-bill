const jwt = require('jsonwebtoken');

const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'your-customer-jwt-secret-key-change-in-production';

// JWT middleware for Customer Portal API routes
// Supports both JWT tokens (from OTP login) and magic tokens (from direct link)
async function customerJwtAuth(req, res, next) {
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

        // Try JWT first (for OTP/traditional login)
        try {
            const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);
            console.log('✅ CustomerJwtAuth: JWT token verified, decoded:', JSON.stringify(decoded));

            // Attach customer info to request
            req.user = {
                id: decoded.customerId || decoded.id,
                customerId: decoded.customerId || decoded.id,
                phone: decoded.phone,
                serviceId: decoded.serviceId || null
            };
            console.log('✅ CustomerJwtAuth: req.user set (JWT):', JSON.stringify(req.user));
            return next();
        } catch (jwtError) {
            console.log('🔄 CustomerJwtAuth: JWT verification failed, trying magic token...');
            // JWT failed, try magic token below
        }

        // Try magic token (from direct link /customer/login/{token})
        const CustomerTokenService = require('../services/customer-token-service');
        const validation = await CustomerTokenService.validateToken(token);

        if (validation.valid) {
            console.log('✅ CustomerJwtAuth: Magic token valid for customer:', validation.customer.name);
            req.user = {
                id: validation.customer.id,
                customerId: validation.customer.id,
                phone: validation.customer.phone,
                serviceId: null
            };
            console.log('✅ CustomerJwtAuth: req.user set (Magic Token):', JSON.stringify(req.user));
            return next();
        }

        console.log('❌ CustomerJwtAuth: Magic token validation failed:', validation.error);
        return res.status(401).json({
            success: false,
            message: validation.error || 'Invalid token'
        });

    } catch (error) {
        console.log('❌ CustomerJwtAuth: Error:', error.name, error.message);
        return res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
}

module.exports = { customerJwtAuth };

