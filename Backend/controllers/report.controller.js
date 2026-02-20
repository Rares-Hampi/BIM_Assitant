const { getPrismaClient } = require('../utils/database');
const { AppError } = require('../middleware/error.middleware');

const prisma = getPrismaClient();

/**
 * Generate clash detection report
 * POST /api/reports/generate
 */
const generateReport = async (req, res, next) => {
  try {
    const { projectId, fileIds, settings } = req.body;
    
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
    
    // Verify all files exist and are converted
    const files = await prisma.bIMFile.findMany({
      where: {
        id: { in: fileIds },
        projectId
      }
    });
    
    if (files.length !== fileIds.length) {
      throw new AppError('Some files were not found', 404);
    }
    
    const unconvertedFiles = files.filter(f => f.status !== 'completed');
    if (unconvertedFiles.length > 0) {
      throw new AppError('All files must be converted before generating clash report', 400);
    }
    
    // Create clash report record
    const report = await prisma.clashReport.create({
      data: {
        projectId,
        userId: req.userId,
        fileIds,
        status: 'pending',
        settings: settings || {},
        totalClashes: 0,
        criticalClashes: 0,
        majorClashes: 0,
        minorClashes: 0
      }
    });
    
    // TODO: Publish clash detection job to RabbitMQ
    
    res.status(201).json({
      success: true,
      message: 'Clash detection started',
      data: {
        report: {
          id: report.id,
          status: report.status,
          projectId: report.projectId,
          fileIds: report.fileIds,
          createdAt: report.createdAt
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get all reports for a project
 * GET /api/reports/project/:projectId
 */
const getProjectReports = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    
    // Verify project exists and user owns it
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });
    
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    
    if (project.userId !== req.userId) {
      throw new AppError('Access denied', 403);
    }
    
    const reports = await prisma.clashReport.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        fileIds: true,
        totalClashes: true,
        criticalClashes: true,
        majorClashes: true,
        minorClashes: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    res.status(200).json({
      success: true,
      data: {
        reports,
        count: reports.length
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get specific report details
 * GET /api/reports/:reportId
 */
const getReportById = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    
    const report = await prisma.clashReport.findUnique({
      where: { id: reportId }
    });
    
    if (!report) {
      throw new AppError('Report not found', 404);
    }
    
    // Check if user owns this report
    if (report.userId !== req.userId) {
      throw new AppError('Access denied', 403);
    }
    
    res.status(200).json({
      success: true,
      data: {
        report
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Download report
 * GET /api/reports/:reportId/download
 */
const downloadReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const { format = 'json' } = req.query;
    
    const report = await prisma.clashReport.findUnique({
      where: { id: reportId }
    });
    
    if (!report) {
      throw new AppError('Report not found', 404);
    }
    
    if (report.userId !== req.userId) {
      throw new AppError('Access denied', 403);
    }
    
    if (report.status !== 'completed') {
      throw new AppError('Report is not ready for download', 400);
    }
    
    // TODO: Generate/retrieve file from MinIO
    // For now, return JSON data
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="clash-report-${reportId}.json"`);
      
      res.status(200).json({
        reportId: report.id,
        projectId: report.projectId,
        fileIds: report.fileIds,
        statistics: {
          totalClashes: report.totalClashes,
          criticalClashes: report.criticalClashes,
          majorClashes: report.majorClashes,
          minorClashes: report.minorClashes
        },
        clashes: report.clashesData,
        settings: report.settings,
        generatedAt: report.updatedAt
      });
    } else {
      throw new AppError('Unsupported format. Use format=json', 400);
    }
    
  } catch (error) {
    next(error);
  }
};

/**
 * Delete clash report
 * DELETE /api/reports/:reportId
 */
const deleteReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    
    const report = await prisma.clashReport.findUnique({
      where: { id: reportId }
    });
    
    if (!report) {
      throw new AppError('Report not found', 404);
    }
    
    if (report.userId !== req.userId) {
      throw new AppError('Access denied', 403);
    }
    
    // TODO: Delete from MinIO storage
    
    await prisma.clashReport.delete({
      where: { id: reportId }
    });
    
    res.status(200).json({
      success: true,
      message: 'Report deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get paginated clashes from report
 * GET /api/reports/:reportId/clashes
 */
const getReportClashes = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const { page = 1, limit = 50, severity, status } = req.query;
    
    const report = await prisma.clashReport.findUnique({
      where: { id: reportId }
    });
    
    if (!report) {
      throw new AppError('Report not found', 404);
    }
    
    if (report.userId !== req.userId) {
      throw new AppError('Access denied', 403);
    }
    
    // TODO: Implement pagination and filtering from clashesData JSONB
    
    res.status(200).json({
      success: true,
      data: {
        clashes: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0
        },
        message: 'Clash pagination not implemented yet'
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get report statistics
 * GET /api/reports/:reportId/statistics
 */
const getReportStatistics = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    
    const report = await prisma.clashReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        totalClashes: true,
        criticalClashes: true,
        majorClashes: true,
        minorClashes: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    if (!report) {
      throw new AppError('Report not found', 404);
    }
    
    if (report.userId !== req.userId) {
      throw new AppError('Access denied', 403);
    }
    
    res.status(200).json({
      success: true,
      data: {
        statistics: {
          totalClashes: report.totalClashes,
          criticalClashes: report.criticalClashes,
          majorClashes: report.majorClashes,
          minorClashes: report.minorClashes
        },
        status: report.status,
        generatedAt: report.updatedAt
      }
    });
    
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateReport,
  getProjectReports,
  getReportById,
  downloadReport,
  deleteReport,
  getReportClashes,
  getReportStatistics
};
