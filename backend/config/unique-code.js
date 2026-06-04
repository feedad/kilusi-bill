/**
 * Unique Code Generator
 * 
 * Generates a unique numeric code for each invoice to enable
 * bank mutation matching via Autopay.
 * 
 * Code range: 1 to 10^length - 1
 * Default length: 3 (range 1-999)
 */

const { query } = require('./database');
const { getSetting } = require('./settingsManager');
const { logger } = require('./logger');

class UniqueCodeGenerator {
  /**
   * Get the configured code length (default 3)
   */
  getLength() {
    const len = parseInt(getSetting('unique_code_length', '3'));
    return Math.min(Math.max(len, 3), 6); // clamp 3-6
  }

  /**
   * Check if unique code feature is enabled
   */
  isEnabled() {
    const enabled = getSetting('unique_code_enabled', false);
    const autopayEnabled = getSetting('autopay_enabled', false);
    return (enabled === true || enabled === 'true') && (autopayEnabled === true || autopayEnabled === 'true');
  }

  /**
   * Get max code value for current length
   */
  getMaxCode() {
    const len = this.getLength();
    return Math.pow(10, len) - 1;
  }

  /**
   * Get min code value for current length
   */
  getMinCode() {
    return 1;
  }

  /**
   * Generate a new unique code not currently in use.
   * @returns {number} The generated unique code
   * @throws {Error} If all codes in the configured range are in use
   */
  async generateCode() {
    const length = this.getLength();
    const maxCode = this.getMaxCode();

    // Get all codes currently in use by invoices that are NOT paid/cancelled
    const usedResult = await query(
      `SELECT unique_code FROM invoices 
       WHERE unique_code IS NOT NULL AND status NOT IN ('paid', 'cancelled')
       ORDER BY unique_code ASC`
    );

    const usedCodes = new Set(usedResult.rows.map(r => r.unique_code));

    // Find first available code from 1 to max
    for (let code = 1; code <= maxCode; code++) {
      if (!usedCodes.has(code)) {
        logger.info(`[UniqueCode] Generated code ${code} (length: ${length}, max: ${maxCode}, used: ${usedCodes.size})`);
        return code;
      }
    }

    // All codes in use
    const availableCodes = maxCode - usedCodes.size;
    if (availableCodes <= 0) {
      logger.error(`[UniqueCode] ALL ${maxCode} codes are in use! Increase unique_code_length from ${length}.`);
      throw new Error(`Semua ${maxCode} kode terpakai. Naikkan jumlah digit di Setting > Autopay.`);
    }

    throw new Error('Gagal generate kode unik');
  }

  /**
   * Calculate amount with code
   * @param {number} baseAmount - Original invoice amount
   * @param {number} uniqueCode - Generated unique code
   * @returns {number} amount + code
   */
  calculateAmountWithCode(baseAmount, uniqueCode) {
    return Math.round(baseAmount) + uniqueCode;
  }

  /**
   * Get statistics about code usage
   */
  async getStats() {
    const maxCode = this.getMaxCode();
    const totalResult = await query(
      `SELECT COUNT(*) as used FROM invoices 
       WHERE unique_code IS NOT NULL AND status NOT IN ('paid', 'cancelled')`
    );
    const used = parseInt(totalResult.rows[0]?.used || 0);
    const available = maxCode - used;

    return {
      length: this.getLength(),
      max: maxCode,
      used,
      available,
      percentUsed: maxCode > 0 ? Math.round((used / maxCode) * 100) : 0,
      warning: available < Math.max(10, maxCode * 0.1) // warn if <10% available
    };
  }
}

module.exports = new UniqueCodeGenerator();
