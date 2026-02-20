const { getPrismaClient } = require('../utils/database');
const { AppError } = require('../middleware/error.middleware');

const prisma = getPrismaClient();

/**
 * Server-Sent Events for file conversion progress
 * GET /api/progress/:fileId
 */
const streamFileProgress = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    
    // Verify file exists and user owns it
    const file = await prisma.bIMFile.findUnique({
      where: { id: fileId }
    });
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    if (file.userId !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      fileId,
      message: 'Progress stream connected'
    })}\n\n`);
    
    // Poll database for progress updates
    const intervalId = setInterval(async () => {
      try {
        const updatedFile = await prisma.bIMFile.findUnique({
          where: { id: fileId },
          select: {
            id: true,
            status: true,
            progress: true,
            statusMessage: true,
            errorMessage: true
          }
        });
        
        if (!updatedFile) {
          clearInterval(intervalId);
          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: 'File not found'
          })}\n\n`);
          res.end();
          return;
        }
        
        // Send progress update
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          fileId: updatedFile.id,
          status: updatedFile.status,
          progress: updatedFile.progress,
          message: updatedFile.statusMessage,
          error: updatedFile.errorMessage
        })}\n\n`);
        
        // If completed or failed, close connection
        if (updatedFile.status === 'completed' || updatedFile.status === 'failed') {
          clearInterval(intervalId);
          res.write(`data: ${JSON.stringify({
            type: 'done',
            fileId: updatedFile.id,
            status: updatedFile.status,
            message: updatedFile.status === 'completed' ? 'Conversion completed' : 'Conversion failed'
          })}\n\n`);
          res.end();
        }
        
      } catch (error) {
        console.error('Progress polling error:', error);
        clearInterval(intervalId);
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: 'Error polling progress'
        })}\n\n`);
        res.end();
      }
    }, 2000); // Poll every 2 seconds
    
    // Handle client disconnect
    req.on('close', () => {
      console.log(`Client disconnected from progress stream for file ${fileId}`);
      clearInterval(intervalId);
      res.end();
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * SSE for multiple files in a project
 * GET /api/progress/batch/:projectId
 */
const streamBatchProgress = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    
    // Verify project exists and user owns it
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }
    
    if (project.userId !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      projectId,
      message: 'Batch progress stream connected'
    })}\n\n`);
    
    // Poll for all files in project
    const intervalId = setInterval(async () => {
      try {
        const files = await prisma.bIMFile.findMany({
          where: {
            projectId,
            status: {
              in: ['pending', 'processing']
            }
          },
          select: {
            id: true,
            status: true,
            progress: true,
            statusMessage: true,
            originalName: true
          }
        });
        
        // Send batch update
        res.write(`data: ${JSON.stringify({
          type: 'batch_progress',
          projectId,
          files,
          totalFiles: files.length
        })}\n\n`);
        
        // If no files are processing, close connection
        if (files.length === 0) {
          clearInterval(intervalId);
          res.write(`data: ${JSON.stringify({
            type: 'done',
            projectId,
            message: 'All files processed'
          })}\n\n`);
          res.end();
        }
        
      } catch (error) {
        console.error('Batch progress polling error:', error);
        clearInterval(intervalId);
        res.end();
      }
    }, 3000); // Poll every 3 seconds for batch
    
    req.on('close', () => {
      console.log(`Client disconnected from batch progress stream for project ${projectId}`);
      clearInterval(intervalId);
      res.end();
    });
    
  } catch (error) {
    next(error);
  }
};

module.exports = {
  streamFileProgress,
  streamBatchProgress
};
