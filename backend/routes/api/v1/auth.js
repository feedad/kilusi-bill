const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { getSetting } = require('../../../config/settingsManager');
const asyncHandler = require('../../../middleware/response').asyncHandler;

const pool = new Pool({
    host: getSetting('postgres_host', 'localhost'),
    port: parseInt(getSetting('postgres_port', '5432')),
    database: getSetting('postgres_database', 'kilusi_bill'),
    user: getSetting('postgres_user', 'postgres'),
    password: getSetting('postgres_password', 'password'),
});

// Login endpoint
router.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
        return res.sendBadRequest('Username dan password harus diisi', [
            { field: 'username', message: 'Username is required' },
            { field: 'password', message: 'Password is required' }
        ]);
    }

    // First, check admins table for admin/superadmin users
    try {
        const adminQuery = await pool.query(
            'SELECT id, username, email, password_hash, role, is_active FROM admins WHERE username = $1',
            [username]
        );

        if (adminQuery.rows.length > 0) {
            const admin = adminQuery.rows[0];

            // Check if account is active
            if (!admin.is_active) {
                return res.sendUnauthorized('Akun tidak aktif');
            }

            // Verify password
            const validPassword = await bcrypt.compare(password, admin.password_hash);
            if (!validPassword) {
                return res.sendUnauthorized('Username atau password salah');
            }

            // Update last login
            await pool.query(
                'UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
                [admin.id]
            );

            // Create JWT token for admin
            const token = jwt.sign(
                {
                    userId: admin.id,
                    username: admin.username,
                    email: admin.email,
                    role: admin.role
                },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '24h' }
            );

            return res.sendSuccess({
                user: {
                    id: admin.id,
                    username: admin.username,
                    email: admin.email,
                    role: admin.role
                },
                token: token
            }, { action: 'admin_login' });
        }
    } catch (adminError) {
        // admin_users table might not exist yet, continue to fallback
        console.log('admin_users check failed, trying fallback:', adminError.message);
    }

    // Fallback: Check env variables (for backward compatibility)
    const envAdminUsername = process.env.ADMIN_USERNAME;
    const envAdminPassword = process.env.ADMIN_PASSWORD;

    if (envAdminUsername && envAdminPassword &&
        username === envAdminUsername && password === envAdminPassword) {
        const token = jwt.sign(
            {
                userId: 'admin-env',
                username: username,
                email: 'admin@example.com',
                role: 'admin'
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        return res.sendSuccess({
            user: {
                id: 'admin-env',
                username: username,
                email: 'admin@example.com',
                role: 'admin'
            },
            token: token
        }, { action: 'admin_login' });
    }

    // Get user from database
    const userQuery = await pool.query(
        'SELECT id, username, password, role, created_at FROM users WHERE username = $1',
        [username]
    );

    if (userQuery.rows.length === 0) {
        return res.sendUnauthorized('Username atau password salah');
    }

    const user = userQuery.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.sendUnauthorized('Username atau password salah');
    }

    // Generate JWT token
    const token = jwt.sign(
        {
            userId: user.id,
            username: user.username,
            role: user.role
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
    );

    // Update last login
    await pool.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
    );

    return res.sendSuccess({
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            createdAt: user.created_at
        },
        token
    }, { action: 'user_login', lastLogin: new Date().toISOString() });
}));

// Logout endpoint
router.post('/logout', (req, res) => {
    // In a stateless JWT setup, logout is handled client-side
    // but we can provide a response for consistency
    return res.sendSuccess(null, { action: 'logout' }, 'Logout berhasil');
});

// Verify token endpoint
router.get('/verify', asyncHandler(async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.sendUnauthorized('Token tidak ditemukan');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

        // Get fresh user data
        const userQuery = await pool.query(
            'SELECT id, username, role, created_at FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (userQuery.rows.length === 0) {
            return res.sendNotFound('User tidak ditemukan');
        }

        const user = userQuery.rows[0];

        return res.sendSuccess({
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                createdAt: user.created_at
            }
        }, { action: 'token_verified' });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.sendUnauthorized('Token tidak valid');
        }

        if (error.name === 'TokenExpiredError') {
            return res.sendUnauthorized('Token sudah kadaluarsa');
        }

        // Re-throw other errors to be handled by asyncHandler
        throw error;
    }
}));

module.exports = router;