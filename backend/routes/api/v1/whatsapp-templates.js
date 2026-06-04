const express = require('express');
const router = express.Router();
const { getPool } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// Get pool instance
const getTemplatePool = () => getPool();

// Middleware
const { jwtAuth } = require('../../../middleware/jwtAuth');

/**
 * GET /api/v1/whatsapp-templates
 * Get all templates with optional filters
 * PUBLIC endpoint for read access (for development/dashboard)
 */
router.get('/', async (req, res) => {
  try {
    const pool = getPool();

    if (!pool) {
      throw new Error('Database pool not initialized');
    }

    const { category, meta_status, enabled } = req.query;

    let query = 'SELECT * FROM whatsapp_templates WHERE 1=1';
    const params = [];
    const conditions = [];

    if (category) {
      conditions.push(`category = $${params.length + 1}`);
      params.push(category);
    }

    if (meta_status) {
      conditions.push(`meta_status = $${params.length + 1}`);
      params.push(meta_status);
    }

    if (enabled !== undefined) {
      conditions.push(`enabled = $${params.length + 1}`);
      params.push(enabled === 'true');
    }

    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const result = await getPool().query(query, params);

    // Parse JSONB fields
    const templates = result.rows.map(t => ({
      ...t,
      variables: t.variables || [],
      meta_components: t.meta_components || null
    }));

    res.json({
      success: true,
      data: templates,
      total: templates.length
    });
  } catch (error) {
    logger.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/whatsapp-templates/available-variables
 * Returns all unique variables from database templates AND the full parameter registry.
 * Frontend shows this list as clickable badges in the template editor.
 */
router.get('/available-variables', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      throw new Error('Database pool not initialized');
    }

    // 1. Get variables already used in database templates
    const result = await pool.query(`
      SELECT DISTINCT jsonb_array_elements_text(variables) AS variable_name
      FROM whatsapp_templates
      WHERE variables IS NOT NULL AND jsonb_array_length(variables) > 0
      ORDER BY variable_name
    `);

    const dbVars = result.rows.map(row => row.variable_name);

    // 2. Get all registered parameters from the dynamic resolver registry
    const whatsappNotifications = require('../../../config/whatsapp-notifications');
    const registryKeys = Object.keys(whatsappNotifications.PARAMETER_REGISTRY || {});

    // 3. Merge: union of both, sorted alphabetically
    const variables = [...new Set([...dbVars, ...registryKeys])].sort();

    res.json({
      success: true,
      data: { variables }
    });
  } catch (error) {
    logger.error('Error fetching available variables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available variables',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/whatsapp-templates/:id
 * Get single template by ID
 */
router.get('/:id', jwtAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getPool().query(
      'SELECT * FROM whatsapp_templates WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    const template = result.rows[0];
    template.variables = template.variables || [];
    template.meta_components = template.meta_components || null;

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('Error fetching template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/whatsapp-templates
 * Create new template
 */
router.post('/', jwtAuth, async (req, res) => {
  const client = await getPool().connect();

  try {
    const { template_id, name, content, category, variables, meta_name } = req.body;
    const tid = template_id || req.body.id; // Accept both template_id (API) and id (frontend)

    // Validation
    if (!tid || !name || !content) {
      return res.status(400).json({
        success: false,
        message: 'template_id, name, and content are required'
      });
    }

    // Check if template_id already exists
    const existingCheck = await client.query(
      'SELECT id FROM whatsapp_templates WHERE template_id = $1',
      [tid]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Template with this ID already exists'
      });
    }

    // Extract variables from content if not provided
    let templateVariables = variables;
    if (!templateVariables) {
      const variableRegex = /\{\{([^}]+)\}\}/g;
      const matches = [];
      let match;
      while ((match = variableRegex.exec(content)) !== null) {
        matches.push(match[1]);
      }
      templateVariables = [...new Set(matches)];
    }

    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO whatsapp_templates (template_id, name, content, category, variables, created_by, meta_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tid, name, content, category || 'billing', JSON.stringify(templateVariables), req.user?.id, meta_name || null]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        ...result.rows[0],
        variables: templateVariables
      },
      message: 'Template created successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating template:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to create template',
      error: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/v1/whatsapp-templates/:id
 * Update template
 */
router.put('/:id', jwtAuth, async (req, res) => {
  const client = await getPool().connect();

  try {
    const { id } = req.params;
    const { name, content, category, enabled, meta_name } = req.body;

    // Check if template exists
    const existingCheck = await client.query(
      'SELECT * FROM whatsapp_templates WHERE id = $1',
      [id]
    );

    if (existingCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    const existing = existingCheck.rows[0];

    // If content is being updated, re-extract variables
    let variables = existing.variables;
    if (content) {
      const variableRegex = /\{\{([^}]+)\}\}/g;
      const matches = [];
      let match;
      while ((match = variableRegex.exec(content)) !== null) {
        matches.push(match[1]);
      }
      variables = [...new Set(matches)];
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }

    if (content) {
      updates.push(`content = $${paramCount++}`);
      values.push(content);
    }

    // If content or meta_name changed AND previous status was approved/rejected/pending,
    // reset to local so user can resubmit. Also clear meta_template_id.
    const contentChanged = content && content !== existing.content;
    const metaNameChanged = meta_name !== undefined && meta_name !== (existing.meta_name || '');
    if ((contentChanged || metaNameChanged) && existing.meta_status !== 'local') {
      updates.push(`meta_status = $${paramCount++}`);
      values.push('local');
      updates.push(`meta_template_id = $${paramCount++}`);
      values.push(null);
    }

    if (category) {
      updates.push(`category = $${paramCount++}`);
      values.push(category);
    }

    if (enabled !== undefined) {
      updates.push(`enabled = $${paramCount++}`);
      values.push(enabled);
    }

    if (content) {
      updates.push(`variables = $${paramCount++}`);
      values.push(JSON.stringify(variables));
    }

    // meta_name: separate from template_id, used as the Meta template name on submit
    if (meta_name !== undefined) {
      updates.push(`meta_name = $${paramCount++}`);
      values.push(meta_name || null);
    }

    values.push(id);

    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE whatsapp_templates
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        variables
      },
      message: 'Template updated successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating template:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to update template',
      error: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/v1/whatsapp-templates/:id
 * Delete template
 */
router.delete('/:id', jwtAuth, async (req, res) => {
  const client = await getPool().connect();

  try {
    const { id } = req.params;

    const existingCheck = await client.query(
      'SELECT * FROM whatsapp_templates WHERE id = $1',
      [id]
    );

    if (existingCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Don't allow deletion if template is approved and being used
    if (existingCheck.rows[0].meta_status === 'approved' && existingCheck.rows[0].usage_count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete template that is in use'
      });
    }

    await client.query('BEGIN');

    await client.query('DELETE FROM whatsapp_templates WHERE id = $1', [id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error deleting template:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to delete template',
      error: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/whatsapp-templates/:id/submit-meta
 * Submit template to Meta for approval
 */
router.post('/:id/submit-meta', jwtAuth, async (req, res) => {
  const client = await getPool().connect();

  try {
    const { id } = req.params;
    const { meta_category, meta_language } = req.body;

    // Get template
    const templateResult = await client.query(
      'SELECT * FROM whatsapp_templates WHERE id = $1',
      [id]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    const template = templateResult.rows[0];

    if (template.meta_status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Template is already approved'
      });
    }

    // Build Meta template components
    const components = [];

    // Body component (required)
    // IMPORTANT: Meta Cloud API requires variables in format {{1}}, {{2}}, etc.
    // We convert our named variables {{varName}} to indexed variables and provide samples.
    let metaContent = template.content;
    const variableMap = template.variables || [];
    const samples = [];
    
    variableMap.forEach((varName, index) => {
      const regex = new RegExp(`{{${varName}}}`, 'g');
      metaContent = metaContent.replace(regex, `{{${index + 1}}}`);
      
      // Generate a reasonable sample value based on variable name
      // IMPORTANT: order matters - specific patterns first, generic last
      // Longer samples = Meta allocates more space, preventing truncation
      const v = varName.toLowerCase();
      let sampleValue = varName;

      // ===== VERY SPECIFIC (check first to avoid generic matches) =====
      // paymentAccounts must be checked before generic payment
      if (v.includes('paymentaccount') || (v.includes('payment') && (v.includes('account') || v.includes('bank'))))
        sampleValue = 'BANK BRI: 0123456789012345 (NAMA PEMILIK REKENING SATU)\nBANK BCA: 0987654321098765 (NAMA PEMILIK REKENING DUA)\nBANK MANDIRI: 0567890123456789 (NAMA PEMILIK REKENING TIGA)\nBANK BNI: 0112233445566778 (NAMA PEMILIK REKENING EMPAT)\nDANA: 081234567890 (NAMA PEMILIK)\nGOPAY: 081234567891 (NAMA PEMILIK)\nOVO: 081234567892 (NAMA PEMILIK)\nSHOPEEPAY: 081234567893 (NAMA PEMILIK)';
      else if (v.includes('paymentmethod'))
        sampleValue = 'Transfer Bank Standard Chartered Indonesia';
      else if (v.includes('paymentdate'))
        sampleValue = '27 Mei 2026';
      // ===== BROADCAST / MAINTENANCE (500+ chars) =====
      else if (v.includes('content') || v.includes('isi'))
        sampleValue = 'PELANGGAN YANG TERHORMAT,\n\nDIINFORMASIKAN BAHWA AKAN DILAKUKAN PEMELIHARAAN JARINGAN DI WILAYAH ANDA PADA:\n\nHARI/TANGGAL : SABTU, 2026-05-20\nWAKTU        : 23:00 - 05:00 WIB\nAREA         : TALAGA SUNDA, CIBOGO, BUKIT CILAJA\nDAMPAK       : LAYANAN INTERNET AKAN TERPUTUS SELAMA PROSES PEMELIHARAAN\n\nKAMI MOHON MAAF ATAS KETIDAKNYAMANAN INI. JIKA ADA PERTANYAAN, SILAKAN HUBUNGI KAMI.\n\nTERIMA KASIH ATAS PERHATIAN DAN PENGERTIAN ANDA.\n\nSALAM,\nMANAJEMEN';
      // ===== LONG TEXT PARAMETERS =====
      else if (v.includes('description') || v.includes('deskripsi'))
        sampleValue = 'Pelanggan melaporkan gangguan layanan internet. Setelah dilakukan pengecekan oleh tim teknis, ditemukan bahwa kabel fiber optik di tiang depan rumah pelanggan mengalami kerusakan akibat tertimpa pohon. Tim teknis akan melakukan penggantian kabel dan estimasi perbaikan sekitar 2-3 jam.';
      else if (v.includes('resolution') || v.includes('resolusi') || v.includes('penyelesaian'))
        sampleValue = 'Gangguan telah diatasi sepenuhnya. Tim teknis telah mengganti kabel fiber optik yang rusak dan melakukan pengecekan menyeluruh. Layanan internet pelanggan sudah kembali normal. Pelanggan dimohon untuk melaporkan jika masih ada kendala.';
      else if (v.includes('notes') || v.includes('catatan'))
        sampleValue = 'Pelanggan meminta instalasi dilakukan pada pagi hari sebelum pukul 10:00. Pastikan teknisi membawa peralatan lengkap termasuk kabel FO cadangan.';
      else if (v.includes('message') || v.includes('pesan') || (v.includes('update') && !v.includes('date')))
        sampleValue = 'Tiket Anda telah diperbarui oleh tim teknis. Teknisi sedang dalam perjalanan menuju lokasi Anda dengan estimasi waktu tiba sekitar 30 menit. Mohon pastikan alamat dapat diakses.';
      // ===== COMPANY / USERNAME (before generic 'name') =====
      else if (v.includes('company'))
        sampleValue = 'PT KITA SELALU TERKONEKSI SELAMANYA';
      else if (v === 'username')
        sampleValue = '24000010601@kilusi.id';
      // ===== PHONE / CONTACT =====
      else if (v.includes('support') && v.includes('phone'))
        sampleValue = 'https://wa.me/62812345678901';
      else if (v.includes('phone') || v.includes('contact') || v.includes('hp') || v.includes('telepon'))
        sampleValue = '62812345678901';
      // ===== ADDRESS =====
      else if (v.includes('address') || v.includes('alamat'))
        sampleValue = 'Jl. Merdeka No. 123, RT 01 RW 02, Kelurahan Contoh, Kecamatan Sample, Kota Example';
      // ===== CUSTOMER / TECH NAME (generic, after company+username) =====
      else if (v.includes('name') && !v.includes('package'))
        sampleValue = 'Budi Santoso Wijaya Kusuma';
      // ===== INVOICE / TICKET NUMBER =====
      else if (v.includes('service') && v.includes('number'))
        sampleValue = '12345678901';
      else if (v.includes('invoice'))
        sampleValue = 'INV-202605-8637';
      else if (v.includes('number') || (v.includes('ticket') && !v.includes('name')))
        sampleValue = 'TKT-202605-0001';
      // ===== AMOUNT / PRICE =====
      else if (v.includes('amount') || v.includes('harga') || (v.includes('price') && !v.includes('package')))
        sampleValue = '150.000';
      else if (v.includes('price') || v.includes('total'))
        sampleValue = '150.000';
      // ===== DATE / TIME (after specific patterns, before generic) =====
      else if (v.includes('due') || v.includes('active') || v.includes('jatuh') || v.includes('tempo'))
        sampleValue = '27 Mei 2026';
      else if (v.includes('date') && v.includes('reminder'))
        sampleValue = '3';
      else if (v.includes('date') || v.includes('tanggal'))
        sampleValue = '20 Mei 2026';
      else if (v.includes('time') || v.includes('waktu') || v.includes('jam'))
        sampleValue = '14:00';
      // ===== PACKAGE =====
      else if (v.includes('package') && v.includes('speed'))
        sampleValue = '50 Mbps';
      else if (v.includes('package') || v.includes('profil'))
        sampleValue = 'PAKET BRONZE';
      // ===== BILLING =====
      else if (v.includes('billing') || v.includes('jenis') || v.includes('siklus'))
        sampleValue = 'Prabayar';
      // ===== STATUS =====
      else if (v.includes('status') || v.includes('baru'))
        sampleValue = 'Dalam Proses';
      // ===== SUPPORT / TICKET =====
      else if (v.includes('agent') || v.includes('teknisi') || v.includes('technician'))
        sampleValue = 'Teknisi Lapangan A';
      else if (v.includes('subject') || v.includes('subjek'))
        sampleValue = 'Gangguan Internet';
      else if (v.includes('category') || v.includes('kategori'))
        sampleValue = 'Teknis';
      else if (v.includes('reason') || v.includes('alasan'))
        sampleValue = 'Dokumen tidak lengkap / belum memenuhi syarat';
      else if (v.includes('remaining') || v.includes('hari') || v.includes('sisa'))
        sampleValue = '3';
      // ===== BROADCAST / MAINTENANCE META =====
      else if (v.includes('type') || v.includes('tipe'))
        sampleValue = 'Pengumuman';
      else if (v.includes('title') || v.includes('judul'))
        sampleValue = 'Informasi Penting untuk Pelanggan';
      // ===== REGISTRATION / INSTALLATION =====
      else if (v.includes('registration') || v.includes('registrasi') || v.includes('daftar'))
        sampleValue = '20 Mei 2026';
      else if (v.includes('installation') || v.includes('instalasi'))
        sampleValue = '22 Mei 2026';
      else if (v.includes('equipment') || v.includes('peralatan'))
        sampleValue = 'Kabel FO 50m, ONT, Router, Konektor, Patch Cord';
      else if (v.includes('priority') || v.includes('prioritas'))
        sampleValue = 'Normal';
      else if (v.includes('job') || v.includes('tugas'))
        sampleValue = 'JOB-202605-0001';
      // ===== TECHNICAL DETAILS =====
      else if (v.includes('speed') || v.includes('kecepatan'))
        sampleValue = '25 Mbps';
      else if (v.includes('wifi') || v.includes('password'))
        sampleValue = 'wifi12345';
      // ===== GENERIC FALLBACKS (keep last) =====
      else if (v.includes('id'))
        sampleValue = 'INV/2026/0501';
      else if (v.includes('portal') || v.includes('link') || v.includes('url'))
        sampleValue = 'https://portal.kilusi.id/customer/login/ABCDEF1234567890ABCDEF1234567890ABCDEF';
      
      samples.push(sampleValue);
    });

    components.push({
      type: 'BODY',
      text: metaContent,
      example: {
        body_text: [samples]
      }
    });

    // If there are more complex components, they would be added here
    // For now, we're keeping it simple with just body content

    // Submit to Omnichat API for Meta approval
    // Use meta_name if set, otherwise fallback to template_id
    const metaTemplateName = template.meta_name || template.template_id;
    const kilusiOmnichat = require('../../../config/kilusi-whatsapp');
    const result = await kilusiOmnichat.sendTemplate({
      name: metaTemplateName,
      category: meta_category || 'UTILITY',
      language: meta_language || 'id',
      components: components
    });

    // Verify Omnichat accepted the submission before updating status
    if (!result || result.success === false) {
      const errMsg = result?.error || result?.message || 'Omnichat rejected the submission';
      logger.error(`[MetaTemplate] Omnichat rejected ${metaTemplateName}: ${errMsg}`);
      return res.status(400).json({
        success: false,
        message: `Omnichat menolak template: ${errMsg}`,
        meta_response: result
      });
    }

    // Update template status to pending_approval
    await client.query('BEGIN');

    await client.query(`
      UPDATE whatsapp_templates
      SET
        meta_status = 'pending_approval',
        meta_category = $1,
        meta_language = $2,
        meta_components = $3,
        updated_at = NOW()
      WHERE id = $4
    `, [
      meta_category || 'UTILITY',
      meta_language || 'id',
      JSON.stringify(components),
      id
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        template_id: template.template_id,
        meta_status: 'pending_approval',
        meta_response: result
      },
      message: 'Template submitted to Meta for approval'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    // Extract full error details from Omnichat/Meta
    const metaErr = error.metaError || error.data?.data?.error;
    logger.error('Error submitting template to Meta:', {
      message: error.message,
      status: error.status,
      code: error.code,
      metaError: metaErr,
      metaTraceId: error.metaTraceId || metaErr?.fbtrace_id,
      metaUserMsg: error.metaUserMsg || metaErr?.error_user_msg
    });

    res.status(500).json({
      success: false,
      message: 'Failed to submit template to Meta',
      error: metaErr?.error_user_msg || metaErr?.message || error.message,
      meta_error: metaErr,
      fbtrace_id: error.metaTraceId || metaErr?.fbtrace_id
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/whatsapp-templates/:id/send-local
 * Send message using template in local mode (without Meta approval)
 */
router.post('/:id/send-local', jwtAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { phone_number, variables } = req.body;

    if (!phone_number) {
      return res.status(400).json({
        success: false,
        message: 'phone_number is required'
      });
    }

    // Get template
    const result = await getPool().query(
      'SELECT * FROM whatsapp_templates WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    const template = result.rows[0];

    if (!template.enabled) {
      return res.status(400).json({
        success: false,
        message: 'Template is disabled'
      });
    }

    // Replace variables in content
    let message = template.content;
    if (variables && typeof variables === 'object') {
      Object.keys(variables).forEach(key => {
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
      });
    }

    // Send via Omnichat (local mode - uses regular message API)
    const kilusiOmnichat = require('../../../config/kilusi-whatsapp');
    const sendResult = await kilusiOmnichat.sendMessage(phone_number, message, {
      source: 'template_local',
      saveToHistory: true
    });

    // Update usage count
    await getPool().query(
      'UPDATE whatsapp_templates SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      data: {
        message_id: sendResult.messageId,
        phone_number,
        message,
        template_id: template.template_id
      },
      message: 'Message sent using template (local mode)'
    });
  } catch (error) {
    logger.error('Error sending local template message:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/whatsapp-templates/:id/send-meta
 * Send message using approved Meta template
 */
router.post('/:id/send-meta', jwtAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { phone_number, variables } = req.body;

    if (!phone_number) {
      return res.status(400).json({
        success: false,
        message: 'phone_number is required'
      });
    }

    // Get template
    const result = await getPool().query(
      'SELECT * FROM whatsapp_templates WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    const template = result.rows[0];

    if (!template.enabled) {
      return res.status(400).json({
        success: false,
        message: 'Template is disabled'
      });
    }

    if (template.meta_status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Template must be approved by Meta before using Meta mode'
      });
    }

    if (!template.meta_template_id) {
      return res.status(400).json({
        success: false,
        message: 'Template does not have Meta template ID. Please submit to Meta first.'
      });
    }

    // Send using Meta template via Omnichat
    const kilusiOmnichat = require('../../../config/kilusi-whatsapp');
    const sendResult = await kilusiOmnichat.sendTemplateMessage(phone_number, {
      template_id: template.meta_template_id,
      variables: variables || {}
    });

    // Update usage count
    await getPool().query(
      'UPDATE whatsapp_templates SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      data: {
        message_id: sendResult.messageId,
        phone_number,
        template_id: template.template_id,
        meta_template_id: template.meta_template_id
      },
      message: 'Message sent using Meta template'
    });
  } catch (error) {
    logger.error('Error sending Meta template message:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
});

module.exports = router;
