const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');

// GET /api/v1/installation-fees - Get all installation fee settings
router.get('/', async (req, res) => {
    try {
        const queryText = `
            SELECT
                ifs.id,
                ifs.billing_type,
                ifs.package_id,
                ifs.fee_amount,
                ifs.description,
                ifs.is_active,
                ifs.created_at,
                ifs.updated_at,
                p.name as package_name,
                p.price as package_price
            FROM installation_fee_settings ifs
            LEFT JOIN packages p ON ifs.package_id = p.id
            ORDER BY
                CASE WHEN ifs.package_id IS NULL THEN 0 ELSE 1 END,
                ifs.billing_type,
                p.name
        `;

        const result = await query(queryText);

        const settings = result.rows.map(setting => ({
            id: setting.id,
            billing_type: setting.billing_type,
            package_id: setting.package_id,
            package_name: setting.package_name,
            package_price: setting.package_price ? parseFloat(setting.package_price) : null,
            fee_amount: parseFloat(setting.fee_amount),
            description: setting.description || null,
            is_active: setting.is_active,
            created_at: setting.created_at,
            updated_at: setting.updated_at
        }));

        res.json({
            success: true,
            data: {
                settings
            }
        });

    } catch (error) {
        logger.error('Error fetching installation fee settings:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pengaturan biaya instalasi'
        });
    }
});

// GET /api/v1/installation-fees/:billingType - Get installation fee by billing type
router.get('/:billingType', async (req, res) => {
    try {
        const { billingType } = req.params;

        if (!['prepaid', 'postpaid'].includes(billingType)) {
            return res.status(400).json({
                success: false,
                message: 'Tipe billing harus prepaid atau postpaid'
            });
        }

        const queryText = `
            SELECT
                id,
                billing_type,
                fee_amount,
                description,
                is_active,
                created_at,
                updated_at
            FROM installation_fee_settings
            WHERE billing_type = $1 AND is_active = true
        `;

        const result = await query(queryText, [billingType]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pengaturan biaya instalasi tidak ditemukan'
            });
        }

        const setting = result.rows[0];

        res.json({
            success: true,
            data: {
                id: setting.id,
                billing_type: setting.billing_type,
                fee_amount: parseFloat(setting.fee_amount),
                description: setting.description || null,
                is_active: setting.is_active,
                created_at: setting.created_at,
                updated_at: setting.updated_at
            }
        });

    } catch (error) {
        logger.error('Error fetching installation fee setting:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pengaturan biaya instalasi'
        });
    }
});

// PUT /api/v1/installation-fees/:id - Update installation fee setting
router.put('/:id', async (req, res) => {
    try {
        const settingId = req.params.id;
        const { billing_type, package_id, fee_amount, description, is_active } = req.body;

        if (!['prepaid', 'postpaid'].includes(billing_type)) {
            return res.status(400).json({
                success: false,
                message: 'Tipe billing harus prepaid atau postpaid'
            });
        }

        if (fee_amount === null || fee_amount === undefined || fee_amount < 0) {
            return res.status(400).json({
                success: false,
                message: 'Jumlah biaya instalasi harus valid'
            });
        }

        const updateQuery = `
            UPDATE installation_fee_settings
            SET billing_type = $1, package_id = $2, fee_amount = $3, description = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
        `;

        const result = await query(updateQuery, [
            billing_type,
            package_id || null,
            parseFloat(fee_amount),
            description || null,
            is_active !== undefined ? is_active : true,
            settingId
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pengaturan biaya instalasi tidak ditemukan'
            });
        }

        const updatedSetting = result.rows[0];

        res.json({
            success: true,
            message: 'Pengaturan biaya instalasi berhasil diperbarui',
            data: {
                id: updatedSetting.id,
                billing_type: updatedSetting.billing_type,
                package_id: updatedSetting.package_id,
                fee_amount: parseFloat(updatedSetting.fee_amount),
                description: updatedSetting.description || null,
                is_active: updatedSetting.is_active,
                created_at: updatedSetting.created_at,
                updated_at: updatedSetting.updated_at
            }
        });

    } catch (error) {
        logger.error('Error updating installation fee setting:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui pengaturan biaya instalasi'
        });
    }
});

// GET /api/v1/installation-fees/calculate/:billingType - Calculate installation fee
router.get('/calculate/:billingType', async (req, res) => {
    try {
        const { billingType } = req.params;
        const { package_id } = req.query;

        if (!['prepaid', 'postpaid'].includes(billingType)) {
            return res.status(400).json({
                success: false,
                message: 'Tipe billing harus prepaid atau postpaid'
            });
        }

        let installationFee = 0;
        let description = 'Biaya instalasi default';
        let isDefault = true;

        if (package_id) {
            // Try to get package-specific fee first
            const packageSpecificQuery = `
                SELECT fee_amount, description
                FROM installation_fee_settings
                WHERE billing_type = $1 AND package_id = $2 AND is_active = true
                LIMIT 1
            `;

            const packageResult = await query(packageSpecificQuery, [billingType, package_id]);

            if (packageResult.rows.length > 0) {
                installationFee = parseFloat(packageResult.rows[0].fee_amount);
                description = packageResult.rows[0].description || description;
                isDefault = false;
            }
        }

        if (isDefault) {
            // Fall back to default fee for the billing type
            const defaultQuery = `
                SELECT fee_amount, description
                FROM installation_fee_settings
                WHERE billing_type = $1 AND package_id IS NULL AND is_active = true
                LIMIT 1
            `;

            const defaultResult = await query(defaultQuery, [billingType]);

            if (defaultResult.rows.length > 0) {
                installationFee = parseFloat(defaultResult.rows[0].fee_amount);
                description = defaultResult.rows[0].description || description;
            }
        }

        res.json({
            success: true,
            data: {
                billing_type: billingType,
                package_id: package_id || null,
                installation_fee: installationFee,
                description: description,
                is_default: isDefault,
                calculated_at: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Error calculating installation fee:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghitung biaya instalasi'
        });
    }
});

// POST /api/v1/installation-fees - Create new installation fee
router.post('/', async (req, res) => {
    try {
        const { billing_type, package_id, fee_amount, description, is_active } = req.body;

        if (!['prepaid', 'postpaid'].includes(billing_type)) {
            return res.status(400).json({
                success: false,
                message: 'Tipe billing harus prepaid atau postpaid'
            });
        }

        if (fee_amount === null || fee_amount === undefined || fee_amount < 0) {
            return res.status(400).json({
                success: false,
                message: 'Jumlah biaya instalasi harus valid'
            });
        }

        const createQuery = `
            INSERT INTO installation_fee_settings (billing_type, package_id, fee_amount, description, is_active)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;

        const result = await query(createQuery, [
            billing_type,
            package_id || null,
            parseFloat(fee_amount),
            description || null,
            is_active !== undefined ? is_active : true
        ]);

        if (result.rows.length === 0) {
            return res.status(500).json({
                success: false,
                message: 'Gagal membuat pengaturan biaya instalasi'
            });
        }

        const createdSetting = result.rows[0];

        // Get package info if package_id exists
        let packageInfo = null;
        if (createdSetting.package_id) {
            const packageQuery = 'SELECT name, price FROM packages WHERE id = $1';
            const packageResult = await query(packageQuery, [createdSetting.package_id]);
            if (packageResult.rows.length > 0) {
                packageInfo = {
                    name: packageResult.rows[0].name,
                    price: parseFloat(packageResult.rows[0].price)
                };
            }
        }

        res.status(201).json({
            success: true,
            message: 'Pengaturan biaya instalasi berhasil dibuat',
            data: {
                id: createdSetting.id,
                billing_type: createdSetting.billing_type,
                package_id: createdSetting.package_id,
                package_name: packageInfo?.name || null,
                package_price: packageInfo?.price || null,
                fee_amount: parseFloat(createdSetting.fee_amount),
                description: createdSetting.description || null,
                is_active: createdSetting.is_active,
                created_at: createdSetting.created_at,
                updated_at: createdSetting.updated_at
            }
        });

    } catch (error) {
        logger.error('Error creating installation fee setting:', error);

        // Check for unique constraint violation
        if (error.code === '23505') {
            return res.status(400).json({
                success: false,
                message: 'Pengaturan biaya instalasi untuk kombinasi paket dan tipe billing ini sudah ada'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat membuat pengaturan biaya instalasi'
        });
    }
});

// DELETE /api/v1/installation-fees/:id - Delete installation fee
router.delete('/:id', async (req, res) => {
    try {
        const settingId = req.params.id;

        if (!settingId || isNaN(settingId)) {
            return res.status(400).json({
                success: false,
                message: 'ID pengaturan biaya instalasi tidak valid'
            });
        }

        // Check if setting exists first
        const checkQuery = 'SELECT * FROM installation_fee_settings WHERE id = $1';
        const checkResult = await query(checkQuery, [settingId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pengaturan biaya instalasi tidak ditemukan'
            });
        }

        const deleteQuery = 'DELETE FROM installation_fee_settings WHERE id = $1 RETURNING *';
        const result = await query(deleteQuery, [settingId]);

        const deletedSetting = result.rows[0];

        res.json({
            success: true,
            message: 'Pengaturan biaya instalasi berhasil dihapus',
            data: {
                id: deletedSetting.id,
                billing_type: deletedSetting.billing_type,
                package_id: deletedSetting.package_id,
                fee_amount: parseFloat(deletedSetting.fee_amount),
                description: deletedSetting.description || null,
                is_active: deletedSetting.is_active
            }
        });

    } catch (error) {
        logger.error('Error deleting installation fee setting:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghapus pengaturan biaya instalasi'
        });
    }
});

module.exports = router;