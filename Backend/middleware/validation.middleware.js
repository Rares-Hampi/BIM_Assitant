/**
 * Validation middleware for request data
 * Using manual validation (can be replaced with Joi or Zod later)
 */

/**
 * Validate registration data
 */
const validateRegistration = (req, res, next) => {
  const { email, password, fullName } = req.body;
  const errors = [];
  
  // Validate email
  if (!email || typeof email !== 'string') {
    errors.push('Email is required');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
    }
  }
  
  // Validate password
  if (!password || typeof password !== 'string') {
    errors.push('Password is required');
  } else if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  // Validate full name
  if (!fullName || typeof fullName !== 'string') {
    errors.push('Full name is required');
  } else if (fullName.trim().length < 2) {
    errors.push('Full name must be at least 2 characters long');
  }
  
  // Optional: Validate company
  if (req.body.company && typeof req.body.company !== 'string') {
    errors.push('Company must be a string');
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Validate login data
 */
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];
  
  if (!email || typeof email !== 'string') {
    errors.push('Email is required');
  }
  
  if (!password || typeof password !== 'string') {
    errors.push('Password is required');
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Validate project creation data
 */
const validateProjectCreate = (req, res, next) => {
  const { name } = req.body;
  const errors = [];
  
  if (!name || typeof name !== 'string') {
    errors.push('Project name is required');
  } else if (name.trim().length < 3) {
    errors.push('Project name must be at least 3 characters long');
  }
  
  // Optional: Validate description
  if (req.body.description) {
    if (typeof req.body.description !== 'string') {
      errors.push('Description must be a string');
    } else if (req.body.description.length > 500) {
      errors.push('Description must be less than 500 characters');
    }
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Validate project update data
 */
const validateProjectUpdate = (req, res, next) => {
  const { name, description, status } = req.body;
  const errors = [];
  
  // At least one field should be provided
  if (!name && !description && !status) {
    return res.status(400).json({
      success: false,
      message: 'At least one field (name, description, status) must be provided'
    });
  }
  
  // Validate name if provided
  if (name) {
    if (typeof name !== 'string') {
      errors.push('Name must be a string');
    } else if (name.trim().length < 3) {
      errors.push('Name must be at least 3 characters long');
    }
  }
  
  // Validate description if provided
  if (description) {
    if (typeof description !== 'string') {
      errors.push('Description must be a string');
    } else if (description.length > 500) {
      errors.push('Description must be less than 500 characters');
    }
  }
  
  // Validate status if provided
  if (status) {
    const validStatuses = ['active', 'archived', 'completed'];
    if (!validStatuses.includes(status)) {
      errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Validate UUID parameter
 */
const validateUUID = (paramName) => {
  return (req, res, next) => {
    const value = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!value || !uuidRegex.test(value)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName}. Must be a valid UUID.`
      });
    }
    
    next();
  };
};

/**
 * Validate clash report generation data
 */
const validateClashReportGeneration = (req, res, next) => {
  const { projectId, fileIds, settings } = req.body;
  const errors = [];
  
  // Validate projectId
  if (!projectId || typeof projectId !== 'string') {
    errors.push('Project ID is required');
  }
  
  // Validate fileIds
  if (!fileIds || !Array.isArray(fileIds)) {
    errors.push('File IDs array is required');
  } else if (fileIds.length < 2) {
    errors.push('At least 2 files are required for clash detection');
  } else if (fileIds.some(id => typeof id !== 'string')) {
    errors.push('All file IDs must be strings');
  }
  
  // Validate settings (optional)
  if (settings) {
    if (typeof settings !== 'object') {
      errors.push('Settings must be an object');
    } else {
      // Validate tolerance if provided
      if (settings.tolerance !== undefined) {
        if (typeof settings.tolerance !== 'number' || settings.tolerance < 0) {
          errors.push('Tolerance must be a positive number');
        }
      }
      
      // Validate checkTypes if provided
      if (settings.checkTypes) {
        if (!Array.isArray(settings.checkTypes)) {
          errors.push('Check types must be an array');
        }
      }
    }
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Validate pagination parameters
 */
const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;
  
  // Set defaults
  req.pagination = {
    page: 1,
    limit: 50
  };
  
  if (page) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page must be a positive integer'
      });
    }
    req.pagination.page = pageNum;
  }
  
  if (limit) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 100'
      });
    }
    req.pagination.limit = limitNum;
  }
  
  next();
};

module.exports = {
  validateRegistration,
  validateLogin,
  validateProjectCreate,
  validateProjectUpdate,
  validateUUID,
  validateClashReportGeneration,
  validatePagination
};
