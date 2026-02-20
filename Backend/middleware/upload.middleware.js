const multer = require('multer');
const path = require('path');

// Configure multer for memory storage (we'll upload to MinIO directly)
const storage = multer.memoryStorage();

/**
 * File filter to accept only IFC files
 */
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.ifc', '.ifczip'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${allowedExtensions.join(', ')} files are allowed.`), false);
  }
};

/**
 * Multer configuration for IFC file uploads
 */
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 500 * 1024 * 1024, // Default 500MB
    files: parseInt(process.env.MAX_FILES_PER_UPLOAD) || 10 // Default 10 files
  }
});

/**
 * Middleware for single file upload
 */
const uploadSingle = upload.single('file');

/**
 * Middleware for multiple files upload
 */
const uploadMultiple = upload.array('files', parseInt(process.env.MAX_FILES_PER_UPLOAD) || 10);

/**
 * Error handling middleware for multer errors
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${(parseInt(process.env.MAX_FILE_SIZE) / 1024 / 1024).toFixed(0)}MB`
      });
    }
    
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: `Too many files. Maximum is ${process.env.MAX_FILES_PER_UPLOAD} files per upload`
      });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name in upload'
      });
    }
    
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  if (err) {
    // Other errors (like file filter rejection)
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next();
};

/**
 * Validate uploaded files exist
 */
const validateFiles = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded. Please select at least one file.'
      });
    }
  }
  
  next();
};

/**
 * Middleware to validate project ID in request body
 */
const validateProjectId = (req, res, next) => {
  const { projectId } = req.body;
  
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Valid project ID is required'
    });
  }
  
  next();
};

/**
 * Add file metadata to request
 */
const addFileMetadata = (req, res, next) => {
  const files = req.files || (req.file ? [req.file] : []);
  
  req.fileMetadata = files.map(file => ({
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
    encoding: file.encoding
  }));
  
  next();
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  handleUploadError,
  validateFiles,
  validateProjectId,
  addFileMetadata
};
