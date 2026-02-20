const { getPrismaClient } = require('../utils/database');
const { AppError } = require('../middleware/error.middleware');
const { publishConversionJob } = require('../services/queue.service');
const fs = require('fs').promises;
const path = require('path');

const prisma = getPrismaClient();

/**
 * Upload IFC files
 * POST /api/upload
 */
const uploadFiles = async (req, res, next) => {
  try {
    const { projectId } = req.body;
    const files = req.files;
    
    if (!files || files.length === 0) {
      throw new AppError('No files uploaded', 400);
    }
    
    // Verify project exists and user owns it
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });
    
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    
    if (project.userId !== req.userId) {
      throw new AppError('Access denied. You do not own this project.', 403);
    }
    
    // Create temporary uploads directory
    const uploadsDir = path.join(__dirname, '../uploads/temp');
    await fs.mkdir(uploadsDir, { recursive: true });
    
    // Save files temporarily and create records
    const uploadedFiles = [];
    
    for (const file of files) {
      const fileName = `${Date.now()}-${file.originalname}`;
      const tempPath = path.join(uploadsDir, fileName);
      
      // Save file temporarily to filesystem
      await fs.writeFile(tempPath, file.buffer);
      
      // Create file record in database
      const bimFile = await prisma.bIMFile.create({
        data: {
          projectId,
          userId: req.userId,
          originalName: file.originalname,
          fileName,
          fileType: 'Unknown', // Will be determined by conversion worker
          fileSize: BigInt(file.size),
          mimeType: file.mimetype,
          storagePath: tempPath, // Temporary path
          status: 'pending',
          progress: 0,
          statusMessage: 'Queued for conversion'
        }
      });
      
      // Publish conversion job to RabbitMQ
      // Worker will process file and delete original after conversion
      await publishConversionJob({
        fileId: bimFile.id,
        projectId,
        userId: req.userId,
        tempPath,
        originalName: file.originalname
      });
      
      uploadedFiles.push(bimFile);
    }
    
    res.status(201).json({
      success: true,
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
      data: {
        files: uploadedFiles,
        projectId
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get upload/conversion status
 * GET /api/upload/status/:jobId
 */
const getStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    
    // TODO: Implement job status tracking
    // For now, return placeholder
    
    res.status(200).json({
      success: true,
      data: {
        jobId,
        status: 'pending',
        message: 'Job status tracking not implemented yet'
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get specific file status
 * GET /api/upload/files/:fileId
 */
const getFileStatus = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    
    const file = await prisma.bIMFile.findUnique({
      where: { id: fileId }
    });
    
    if (!file) {
      throw new AppError('File not found', 404);
    }
    
    // Check if user owns this file
    if (file.userId !== req.userId) {
      throw new AppError('Access denied. You do not own this file.', 403);
    }
    
    res.status(200).json({
      success: true,
      data: {
        file
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Delete uploaded file
 * DELETE /api/upload/files/:fileId
 */
const deleteFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    
    const file = await prisma.bIMFile.findUnique({
      where: { id: fileId }
    });
    
    if (!file) {
      throw new AppError('File not found', 404);
    }
    
    // Check if user owns this file
    if (file.userId !== req.userId) {
      throw new AppError('Access denied. You do not own this file.', 403);
    }
    
    // TODO: Delete from MinIO storage
    // TODO: Cancel pending conversion jobs
    
    // Delete from database
    await prisma.bIMFile.delete({
      where: { id: fileId }
    });
    
    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadFiles,
  getStatus,
  getFileStatus,
  deleteFile
};
