const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../config/middleware');
const settingsManager = require('../config/settingsManager');
const { logger } = require('../config/logger');
const fs = require('fs').promises;
const path = require('path');

// GET MikroTik Scripts Page
router.get('/', requireAdminAuth, async (req, res) => {
  try {
    const settings = settingsManager.getSettingsWithCache();
    
    // Read script files
    const scriptsPath = path.join(__dirname, '../config');
    let isolirScript = '';
    let unisolirScript = '';
    let customScript = '';
    
    try {
      const isolirCommands = await fs.readFile(path.join(scriptsPath, 'mikrotik-commands.js'), 'utf8');
      const match = isolirCommands.match(/\/\/\s*ISOLIR\s*SCRIPT([\s\S]*?)\/\/\s*END\s*ISOLIR/);
      if (match) isolirScript = match[1].trim();
    } catch (e) {
      logger.warn('Could not read isolir script');
    }
    
    try {
      const unisolirCommands = await fs.readFile(path.join(scriptsPath, 'mikrotik-commands.js'), 'utf8');
      const match = unisolirCommands.match(/\/\/\s*UNISOLIR\s*SCRIPT([\s\S]*?)\/\/\s*END\s*UNISOLIR/);
      if (match) unisolirScript = match[1].trim();
    } catch (e) {
      logger.warn('Could not read unisolir script');
    }

    res.render('admin-mikrotik-scripts', {
      page: 'mikrotik-scripts',
      settings,
      isolirScript,
      unisolirScript,
      customScript,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    logger.error(`Error loading MikroTik scripts: ${error.message}`);
    res.status(500).send('Error loading scripts');
  }
});

// POST Update MikroTik Scripts
router.post('/update', requireAdminAuth, async (req, res) => {
  try {
    const { isolir_script, unisolir_script, custom_script } = req.body;
    
    const settings = settingsManager.getSettingsWithCache();
    settings.mikrotik_isolir_script = isolir_script || '';
    settings.mikrotik_unisolir_script = unisolir_script || '';
    settings.mikrotik_custom_script = custom_script || '';
    
    settingsManager.saveSettings(settings);
    
    logger.info(`MikroTik scripts updated by admin`);
    res.redirect('/admin/mikrotik-scripts?success=' + encodeURIComponent('Skrip MikroTik berhasil diperbarui'));
  } catch (error) {
    logger.error(`Error updating MikroTik scripts: ${error.message}`);
    res.redirect('/admin/mikrotik-scripts?error=' + encodeURIComponent('Gagal memperbarui skrip MikroTik'));
  }
});

module.exports = router;
