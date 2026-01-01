/**
 * Branding Upload Routes
 * Handles logo and favicon uploads with local storage
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { jwtAuth } = require('../../../middleware/jwtAuth');

// Ensure upload directories exist
const uploadDir = path.join(__dirname, '../../../public/uploads/branding');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const type = req.params.type; // 'logo' or 'favicon'
    const filename = `${type}${ext}`;
    cb(null, filename);
  }
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon', 'image/ico', 'image/vnd.microsoft.icon'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Hanya file gambar (PNG, JPEG, SVG, ICO) yang diizinkan'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB max
  }
});

/**
 * POST /api/v1/branding/upload/:type
 * Upload logo or favicon
 * :type = 'logo' | 'favicon'
 */
router.post('/upload/:type', jwtAuth, async (req, res) => {
  const { type } = req.params;
  
  if (!['logo', 'favicon'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'Type harus "logo" atau "favicon"'
    });
  }

  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Ukuran file maksimal 2MB'
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File tidak ditemukan'
      });
    }

    // Return the public URL
    const publicUrl = `/uploads/branding/${req.file.filename}`;
    
    res.json({
      success: true,
      message: `${type === 'logo' ? 'Logo' : 'Favicon'} berhasil diupload`,
      data: {
        filename: req.file.filename,
        url: publicUrl,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  });
});

/**
 * GET /api/v1/branding/public
 * Get branding settings without authentication (for login pages)
 */
router.get('/public', async (req, res) => {
  try {
    const { getSetting } = require('../../../config/settingsManager');
    const branding = getSetting('branding') || {
      siteTitle: 'Kilusi Bill',
      titleType: 'text',
      logoUrl: '',
      faviconUrl: '/favicon.ico'
    };
    
    res.json({
      success: true,
      data: { branding }
    });
  } catch (error) {
    console.error('Error getting public branding:', error);
    res.json({
      success: true,
      data: {
        branding: {
          siteTitle: 'Kilusi Bill',
          titleType: 'text',
          logoUrl: '',
          faviconUrl: '/favicon.ico'
        }
      }
    });
  }
});

/**
 * GET /api/v1/branding/files
 * List uploaded branding files
 */
router.get('/files', jwtAuth, async (req, res) => {
  try {
    const files = [];
    
    if (fs.existsSync(uploadDir)) {
      const items = fs.readdirSync(uploadDir);
      
      for (const item of items) {
        const filePath = path.join(uploadDir, item);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
          files.push({
            filename: item,
            url: `/uploads/branding/${item}`,
            size: stat.size,
            modified: stat.mtime
          });
        }
      }
    }
    
    res.json({
      success: true,
      data: { files }
    });
  } catch (error) {
    console.error('Error listing branding files:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil daftar file'
    });
  }
});

/**
 * DELETE /api/v1/branding/delete/:type
 * Delete logo or favicon
 */
router.delete('/delete/:type', jwtAuth, async (req, res) => {
  const { type } = req.params;
  
  if (!['logo', 'favicon'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'Type harus "logo" atau "favicon"'
    });
  }

  try {
    const files = fs.readdirSync(uploadDir);
    const targetFile = files.find(f => f.startsWith(type));
    
    if (targetFile) {
      fs.unlinkSync(path.join(uploadDir, targetFile));
      
      res.json({
        success: true,
        message: `${type === 'logo' ? 'Logo' : 'Favicon'} berhasil dihapus`
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'File tidak ditemukan'
      });
    }
  } catch (error) {
    console.error('Error deleting branding file:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal menghapus file'
    });
  }
});

module.exports = router;
