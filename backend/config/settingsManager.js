require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

// We will delay required SettingsService until initialization to avoid circular deps if any
let settingsService = null;

const settingsPath = path.join(process.cwd(), 'settings.json');
let localCache = {};
let isInitialized = false;

// Map settings keys to Environment Variables
const ENV_MAPPING = {
  'postgres_host': 'POSTGRES_HOST',
  'postgres_port': 'POSTGRES_PORT',
  'postgres_database': 'POSTGRES_DATABASE',
  'postgres_user': 'POSTGRES_USER',
  'postgres_password': 'POSTGRES_PASSWORD',
  'postgres_pool_max': 'POSTGRES_POOL_MAX',
  'postgres_idle_timeout': 'POSTGRES_IDLE_TIMEOUT',
  'postgres_connection_timeout': 'POSTGRES_CONNECTION_TIMEOUT',
  'postgres_ssl': 'POSTGRES_SSL',
  'server_port': 'PORT',
  'server_host': 'HOST',
  'api_key': 'API_KEY',
  'secret_key': 'SESSION_SECRET',
  'admin_username': 'ADMIN_USERNAME',
  'admin_password': 'ADMIN_PASSWORD',
  'tripay.api_key': 'TRIPAY_API_KEY',
  'tripay.private_key': 'TRIPAY_PRIVATE_KEY',
  'tripay.merchant_code': 'TRIPAY_MERCHANT_CODE'
};

/**
 * Load settings from JSON file (Legacy/Fallback)
 */
function loadFileSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    // console.error('Error reading settings.json:', e);
  }
  return {};
}

/**
 * Initialize the settings manager
 * Reads: File -> DB -> Env (Priority: Env > DB > File)
 */
async function initialize() {
  try {
    if (!settingsService) {
      try {
        settingsService = require('../services/settings-service');
      } catch (e) {
        // DB might not be connected yet or service issue
        logger.warn('SettingsService could not be loaded yet.');
      }
    }

    // 1. Load File Settings
    const fileSettings = loadFileSettings();

    // 2. Load DB Settings
    let dbSettings = {};
    if (settingsService) {
      try {
        dbSettings = await settingsService.getAllSettings();
        logger.info(`Loaded ${Object.keys(dbSettings).length} settings from DB`);
      } catch (e) {
        logger.warn(`Failed to load settings from DB: ${e.message}`);
      }
    }

    // 3. Merge Phase (File < DB)
    localCache = { ...fileSettings, ...dbSettings };

    // 4. Apply Environment Overrides
    Object.entries(ENV_MAPPING).forEach(([key, envVar]) => {
      if (process.env[envVar] !== undefined) {
        // Handle nested keys (e.g. tripay.api_key) only for specific object structures if needed
        // For now, flat keys preference. 
        // Note: Existing code uses nested objects in settings.json mostly for organization,
        // but getSetting('payment_gateway.tripay.api_key') is how it's usually accessed?
        // Let's stick to flat overrides for the top level, or specific known paths.

        localCache[key] = process.env[envVar];
      }
    });

    isInitialized = true;
    logger.info('SettingsManager initialized successfully');
    return true;
  } catch (error) {
    logger.error(`SettingsManager initialization failed: ${error.message}`);
    return false;
  }
}

/**
 * Get a setting value (Synchronous)
 */
function getSetting(key, defaultValue) {
  // If not initialized, try to load file settings at least (for bootstrap)
  if (!isInitialized && Object.keys(localCache).length === 0) {
    localCache = loadFileSettings();
  }

  // 1. Check Env Vars directly (Priority)
  if (ENV_MAPPING[key] && process.env[ENV_MAPPING[key]]) {
    return process.env[ENV_MAPPING[key]];
  }

  // 2. Check local initialized cache
  if (localCache[key] !== undefined) return localCache[key];

  // Support dot notation for nested objects
  if (key.includes('.')) {
    // Check nested env override logic if necessary, or skip
    const parts = key.split('.');
    let value = localCache;
    for (const part of parts) {
      if (value === undefined || value === null) break;
      value = value[part];
    }
    if (value !== undefined) return value;
  }

  return defaultValue;
}

/**
 * Update a setting
 * Updates Cache AND DB
 */
async function updateSetting(key, value) {
  if (!settingsService) settingsService = require('../services/settings-service');

  try {
    // Update DB
    // We assume most updates via this method are dynamic business settings
    // If it's a nested key, we might need special handling, but the new design encourages flat keys for DB app_config
    // For backwards compatibility, if key is simple, save to DB.

    await settingsService.set(key, value);

    // Update Local Cache
    localCache[key] = value;

    // Also update file for fallback (optional, maybe we stop writing to file?)
    // Let's KEEP writing to file for now until migration is 100% confirmed stable, 
    // OR disable it to enforce moving to DB. The plan is "Cleanup settings.json", so we should stop writing secrets to it.
    // We will stop writing to settings.json to enforce DB source of truth.

    return true;
  } catch (e) {
    logger.error(`Error updating setting ${key}: ${e.message}`);
    return false;
  }
}

// Helper to manually refresh cache (e.g., triggered by event)
async function refreshSettings() {
  return await initialize();
}

// For compatibility with old module exports
function getSettingsWithCache() {
  return localCache;
}

function getAllSettings() {
  return localCache;
}

module.exports = {
  initialize, // New method to start async loading
  getSetting,
  updateSetting,
  getAllSettings,
  getSettingsWithCache,
  refreshSettings
};