const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const bcrypt = require('bcrypt');
const { logger } = require('../../../config/logger');

const SALT_ROUNDS = 10;

// Valid roles
const VALID_ROLES = ['superadmin', 'administrator', 'technician', 'finance', 'operator', 'admin'];

/**
 * GET /api/v1/admins
 * List all admin users
 */
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                id, 
                username, 
                role, 
                email,
                last_login, 
                created_at, 
                updated_at
            FROM users
            ORDER BY created_at DESC
        `);

        // Add virtual is_active field (always true for now as DB has no column)
        const admins = result.rows.map(admin => ({
            ...admin,
            is_active: true
        }));

        res.json({
            success: true,
            data: {
                admins: admins,
                total: result.rows.length
            }
        });
    } catch (error) {
        logger.error('Failed to fetch admins:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data admin'
        });
    }
});

/**
 * GET /api/v1/admins/:id
 * Get single admin by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(`
            SELECT 
                id, 
                username, 
                role,
                email,
                last_login, 
                created_at, 
                updated_at
            FROM users
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Admin tidak ditemukan'
            });
        }

        const admin = {
            ...result.rows[0],
            is_active: true
        };

        res.json({
            success: true,
            data: admin
        });
    } catch (error) {
        logger.error('Failed to fetch admin:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data admin'
        });
    }
});

/**
 * POST /api/v1/admins
 * Create new admin user
 */
router.post('/', async (req, res) => {
    try {
        const { username, password, role = 'operator', email } = req.body;

        // Validation
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username dan password wajib diisi'
            });
        }

        if (username.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Username minimal 3 karakter'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password minimal 6 karakter'
            });
        }

        if (!VALID_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: `Role tidak valid. Pilihan: ${VALID_ROLES.join(', ')}`
            });
        }

        // Check if username already exists
        const existing = await query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Username sudah digunakan'
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Insert new admin
        const result = await query(
            `INSERT INTO users (username, password, role, email) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, username, role, email, created_at`,
            [username, passwordHash, role, email || null]
        );

        logger.info(`Admin created: ${username} with role ${role}`);

        res.status(201).json({
            success: true,
            message: 'Admin berhasil dibuat',
            data: {
                ...result.rows[0],
                is_active: true
            }
        });
    } catch (error) {
        logger.error('Failed to create admin:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal membuat admin'
        });
    }
});

/**
 * PUT /api/v1/admins/:id
 * Update admin user
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, role, email } = req.body;
        // removed is_active

        // Check if admin exists
        const existing = await query(
            'SELECT id, username FROM users WHERE id = $1',
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Admin tidak ditemukan'
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (username !== undefined) {
            if (username.length < 3) {
                return res.status(400).json({
                    success: false,
                    message: 'Username minimal 3 karakter'
                });
            }

            // Check if new username is taken by another user
            const usernameCheck = await query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [username, id]
            );

            if (usernameCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Username sudah digunakan'
                });
            }

            updates.push(`username = $${paramIndex++}`);
            values.push(username);
        }

        if (role !== undefined) {
            if (!VALID_ROLES.includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: `Role tidak valid. Pilihan: ${VALID_ROLES.join(', ')}`
                });
            }
            updates.push(`role = $${paramIndex++}`);
            values.push(role);
        }
        
        if (email !== undefined) {
            updates.push(`email = $${paramIndex++}`);
            values.push(email);
        }

        // is_active ignored as column doesn't exist

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Tidak ada data yang diubah'
            });
        }

        // Add updated_at
        updates.push(`updated_at = NOW()`);

        // Add id to values
        values.push(id);

        const result = await query(
            `UPDATE users 
             SET ${updates.join(', ')} 
             WHERE id = $${paramIndex}
             RETURNING id, username, role, email, updated_at`,
            values
        );

        logger.info(`Admin updated: ${id}`);

        res.json({
            success: true,
            message: 'Admin berhasil diperbarui',
            data: {
                ...result.rows[0],
                is_active: true
            }
        });
    } catch (error) {
        logger.error('Failed to update admin:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memperbarui admin'
        });
    }
});

/**
 * PUT /api/v1/admins/:id/password
 * Change admin password
 */
router.put('/:id/password', async (req, res) => {
    try {
        const { id } = req.params;
        const { password, current_password } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password baru wajib diisi'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password minimal 6 karakter'
            });
        }

        // Check if admin exists
        const existing = await query(
            'SELECT id, password FROM users WHERE id = $1',
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Admin tidak ditemukan'
            });
        }

        // If current_password provided, verify it (for self-password change)
        if (current_password) {
            const isValid = await bcrypt.compare(current_password, existing.rows[0].password);
            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Password lama tidak valid'
                });
            }
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        await query(
            `UPDATE users 
             SET password = $1, updated_at = NOW() 
             WHERE id = $2`,
            [passwordHash, id]
        );

        logger.info(`Password changed for admin: ${id}`);

        res.json({
            success: true,
            message: 'Password berhasil diubah'
        });
    } catch (error) {
        logger.error('Failed to change password:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengubah password'
        });
    }
});

/**
 * DELETE /api/v1/admins/:id
 * Delete admin user
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if admin exists
        const existing = await query(
            'SELECT id, username FROM users WHERE id = $1',
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Admin tidak ditemukan'
            });
        }

        // Prevent self-deletion (optional - based on JWT user)
        // You might want to check if the current user is trying to delete themselves

        await query('DELETE FROM users WHERE id = $1', [id]);

        logger.info(`Admin deleted: ${existing.rows[0].username}`);

        res.json({
            success: true,
            message: 'Admin berhasil dihapus'
        });
    } catch (error) {
        logger.error('Failed to delete admin:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menghapus admin'
        });
    }
});

module.exports = router;
