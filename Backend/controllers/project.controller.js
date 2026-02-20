const { getPrismaClient } = require('../utils/database');
const { AppError } = require('../middleware/error.middleware');

const prisma = getPrismaClient();

/**
 * Get all projects for current user
 * GET /api/projects
 */
const getAllProjects = async (req, res, next) => {
  try {
    const { status } = req.query;
    
    const where = {
      userId: req.userId
    };
    
    // Filter by status if provided
    if (status) {
      where.status = status;
    }
    
    const projects = await prisma.project.findMany({
      where,
      include: {
        _count: {
          select: {
            files: true,
            clashReports: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    res.status(200).json({
      success: true,
      data: {
        projects,
        count: projects.length
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Create new project
 * POST /api/projects
 */
const createProject = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    
    const project = await prisma.project.create({
      data: {
        name,
        description: description || null,
        userId: req.userId,
        status: 'active'
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: {
        project
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get project by ID
 * GET /api/projects/:id
 */
const getProjectById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        files: {
          orderBy: { createdAt: 'desc' }
        },
        clashReports: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            totalClashes: true,
            criticalClashes: true,
            majorClashes: true,
            minorClashes: true,
            createdAt: true,
            updatedAt: true
          }
        },
        _count: {
          select: {
            files: true,
            clashReports: true
          }
        }
      }
    });
    
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    
    // Check if user owns this project
    if (project.userId !== req.userId) {
      throw new AppError('Access denied. You do not own this project.', 403);
    }
    
    res.status(200).json({
      success: true,
      data: {
        project
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Update project
 * PUT /api/projects/:id
 */
const updateProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    
    // Check if project exists and user owns it
    const existingProject = await prisma.project.findUnique({
      where: { id }
    });
    
    if (!existingProject) {
      throw new AppError('Project not found', 404);
    }
    
    if (existingProject.userId !== req.userId) {
      throw new AppError('Access denied. You do not own this project.', 403);
    }
    
    // Build update data
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    
    const project = await prisma.project.update({
      where: { id },
      data: updateData
    });
    
    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      data: {
        project
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Delete project
 * DELETE /api/projects/:id
 */
const deleteProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if project exists and user owns it
    const project = await prisma.project.findUnique({
      where: { id }
    });
    
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    
    if (project.userId !== req.userId) {
      throw new AppError('Access denied. You do not own this project.', 403);
    }
    
    // Delete project (cascade will delete files and reports)
    await prisma.project.delete({
      where: { id }
    });
    
    // TODO: Delete files from MinIO storage
    
    res.status(200).json({
      success: true,
      message: 'Project deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get all files in project
 * GET /api/projects/:id/files
 */
const getProjectFiles = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.query;
    
    // Check if project exists and user owns it
    const project = await prisma.project.findUnique({
      where: { id }
    });
    
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    
    if (project.userId !== req.userId) {
      throw new AppError('Access denied. You do not own this project.', 403);
    }
    
    const where = {
      projectId: id
    };
    
    if (status) {
      where.status = status;
    }
    
    const files = await prisma.bIMFile.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.status(200).json({
      success: true,
      data: {
        files,
        count: files.length
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get all clash reports in project
 * GET /api/projects/:id/reports
 */
const getProjectReports = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if project exists and user owns it
    const project = await prisma.project.findUnique({
      where: { id }
    });
    
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    
    if (project.userId !== req.userId) {
      throw new AppError('Access denied. You do not own this project.', 403);
    }
    
    const reports = await prisma.clashReport.findMany({
      where: {
        projectId: id
      },
      orderBy: {
        createdAt: 'desc'
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

module.exports = {
  getAllProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectFiles,
  getProjectReports
};
