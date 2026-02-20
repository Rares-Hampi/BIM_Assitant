const express = require('express');
const router = express.Router();

// GET /api/progress/:fileId - Server-Sent Events for file conversion progress
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx
    
    // Send initial connection message
    res.write(`data: ${JSON.stringify({ 
      type: 'connected', 
      fileId,
      message: 'Progress stream connected' 
    })}\n\n`);
    
    // TODO: Implement in progressController
    // Should:
    // 1. Query database periodically for file status
    // 2. Send updates when status/progress changes
    // 3. Close connection when file is completed or failed
    // 4. Handle client disconnect
    
    // Example polling interval (will be implemented in controller)
    const intervalId = setInterval(async () => {
      try {
        // TODO: Query database for file status
        // const file = await prisma.bIMFile.findUnique({ where: { id: fileId } });
        
        // Send progress update
        // res.write(`data: ${JSON.stringify({
        //   type: 'progress',
        //   fileId,
        //   status: file.status,
        //   progress: file.progress,
        //   message: file.statusMessage
        // })}\n\n`);
        
        // If completed or failed, close connection
        // if (file.status === 'completed' || file.status === 'failed') {
        //   clearInterval(intervalId);
        //   res.write(`data: ${JSON.stringify({
        //     type: 'done',
        //     fileId,
        //     status: file.status
        //   })}\n\n`);
        //   res.end();
        // }
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
    console.error('Progress stream error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /api/progress/batch/:projectId - SSE for multiple files in a project
router.get('/batch/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    res.write(`data: ${JSON.stringify({ 
      type: 'connected', 
      projectId,
      message: 'Batch progress stream connected' 
    })}\n\n`);
    
    // TODO: Implement batch progress tracking
    // Should track all files in project with status 'pending' or 'processing'
    
    const intervalId = setInterval(async () => {
      try {
        // TODO: Query all files in project
        // Send batch update
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
    console.error('Batch progress stream error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
