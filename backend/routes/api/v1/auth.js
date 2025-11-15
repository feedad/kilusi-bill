const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { getSetting } = require('../../../config/settingsManager');

const pool = new Pool({
    host: getSetting('postgres_host', 'localhost'),
    port: parseInt(getSetting('postgres_port', '5432')),
    database: getSetting('postgres_database', 'kilusi_bill'),
    user: getSetting('postgres_user', 'postgres'),
    password: getSetting('postgres_password', 'password'),
});

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validation
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username dan password harus diisi'
            });
        }

        // Temporary bypass for admin users from settings.json
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

        if (username === adminUsername && password === adminPassword) {
            // Create JWT token for admin
            const token = jwt.sign(
                {
                    userId: 'admin',
                    username: username,
                    email: 'admin@example.com',
                    role: 'admin'
                },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '24h' }
            );

            return res.json({
                success: true,
                data: {
                    user: {
                        id: 'admin',
                        username: username,
                        email: 'admin@example.com',
                        role: 'admin'
                    },
                    token: token
                }
            });
        }

        // Get user from database
        const userQuery = await pool.query(
            'SELECT id, username, password, role, created_at FROM users WHERE username = $1',
            [username]
        );

        if (userQuery.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Username atau password salah'
            });
        }

        const user = userQuery.rows[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Username atau password salah'
            });
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

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    createdAt: user.created_at
                },
                token
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server'
        });
    }
});

// Logout endpoint
router.post('/logout', (req, res) => {
    // In a stateless JWT setup, logout is handled client-side
    // but we can provide a response for consistency
    res.json({
        success: true,
        message: 'Logout berhasil'
    });
});

// Verify token endpoint
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token tidak ditemukan'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

        // Get fresh user data
        const userQuery = await pool.query(
            'SELECT id, username, role, created_at FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (userQuery.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }

        const user = userQuery.rows[0];

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    createdAt: user.created_at
                }
            }
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Token tidak valid'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token sudah kadaluarsa'
            });
        }

        console.error('Verify token error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan server'
        });
    }
});

module.exports = router;