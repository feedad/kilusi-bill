const { logger } = require('../config/logger');
const { query } = require('../config/database');

exports.up = async () => {
    try {
        logger.info('Fixing RADIUS table constraints...');

        // 1. Fix radusergroup
        // First, remove duplicates if any
        logger.info('Removing duplicates from radusergroup...');
        await query(`
      DELETE FROM radusergroup a USING radusergroup b
      WHERE a.id < b.id 
      AND a.username = b.username 
      AND a.groupname = b.groupname
    `);

        // Add constraint if not exists
        logger.info('Adding unique constraint to radusergroup...');
        try {
            await query(`
        ALTER TABLE radusergroup 
        ADD CONSTRAINT radusergroup_username_groupname_key UNIQUE (username, groupname)
      `);
            logger.info('Constraint added to radusergroup');
        } catch (err) {
            if (err.message.includes('already exists')) {
                logger.info('Constraint radusergroup_username_groupname_key already exists');
            } else {
                throw err;
            }
        }

        // 2. Fix radcheck
        // First, remove duplicates if any
        logger.info('Removing duplicates from radcheck...');
        await query(`
      DELETE FROM radcheck a USING radcheck b
      WHERE a.id < b.id 
      AND a.username = b.username 
      AND a.attribute = b.attribute 
      AND a.op = b.op 
      AND a.value = b.value
    `);

        // Add constraint if not exists
        logger.info('Adding unique constraint to radcheck...');
        try {
            await query(`
        ALTER TABLE radcheck 
        ADD CONSTRAINT radcheck_username_attribute_op_value_key UNIQUE (username, attribute, op, value)
      `);
            logger.info('Constraint added to radcheck');
        } catch (err) {
            if (err.message.includes('already exists')) {
                logger.info('Constraint radcheck_username_attribute_op_value_key already exists');
            } else {
                throw err;
            }
        }

        logger.info('RADIUS table constraints fixed successfully');
    } catch (error) {
        logger.error('Error fixing RADIUS constraints:', error);
        throw error;
    }
};

exports.down = async () => {
    try {
        logger.info('Reverting RADIUS table constraints...');
        await query(`ALTER TABLE radusergroup DROP CONSTRAINT IF EXISTS radusergroup_username_groupname_key`);
        await query(`ALTER TABLE radcheck DROP CONSTRAINT IF EXISTS radcheck_username_attribute_op_value_key`);
        logger.info('RADIUS constraints reverted');
    } catch (error) {
        logger.error('Error reverting RADIUS constraints:', error);
        throw error;
    }
};
