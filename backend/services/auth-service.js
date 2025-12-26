const { query } = require('../config/database');
const bcrypt = require('bcrypt');
const { logger } = require('../config/logger');

class AuthService {
    constructor() {
        this.SALT_ROUNDS = 10;
    }

    /**
     * Authenticate user
     * @returns {Object|null} User object without password if success, null if fail
     */
    async login(username, password) {
        try {
            const result = await query('SELECT * FROM "admins" WHERE "username" = $1 AND "is_active" = true', [username]);
            const user = result.rows[0];

            if (!user) {
                // Determine if we should fallback to legacy settings.json admin
                // This is temporary during migration window
                return null;
            }

            const match = await bcrypt.compare(password, user.password_hash);
            if (match) {
                // Update last login
                await query('UPDATE "admins" SET "last_login" = NOW() WHERE "id" = $1', [user.id]);

                const { password_hash, ...safeUser } = user;
                return safeUser;
            } else {
                return null;
            }
        } catch (error) {
            logger.error(`Login error for ${username}: ${error.message}`);
            return null;
        }
    }

    /**
     * Create a new admin user
     */
    async createAdmin(username, password, role = 'operator') {
        try {
            const hash = await bcrypt.hash(password, this.SALT_ROUNDS);
            const result = await query(
                'INSERT INTO "admins" ("username", "password_hash", "role") VALUES ($1, $2, $3) RETURNING "id", "username", "role"',
                [username, hash, role]
            );
            return result.rows[0];
        } catch (error) {
            logger.error(`Failed to create admin ${username}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Change password
     */
    async changePassword(id, newPassword) {
        try {
            const hash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
            await query('UPDATE "admins" SET "password_hash" = $1, "updated_at" = NOW() WHERE "id" = $2', [hash, id]);
            return true;
        } catch (error) {
            logger.error(`Failed to change password for ID ${id}: ${error.message}`);
            return false;
        }
    }
}

module.exports = new AuthService();
