import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Layout/Sidebar';
import NewProjectModal from '../components/Project/NewProjectModal';
import api from '../services/api';
import './ProjectsPage.css';

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  filesCount?: number;
}

const ProjectsPage = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await api.get('projects');
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectClick = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleProjectCreated = (newProject: Project) => {
    setProjects([newProject, ...projects]);
    setShowModal(false);
    // Navigate to the new project
    navigate(`/projects/${newProject.id}`);
  };

  return (
    <div className="projects-page">
      <Sidebar />
      
      <div className="projects-content">
        <div className="projects-header">
          <h1>My Projects</h1>
          <button 
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
          >
            + New Project
          </button>
        </div>

        {loading ? (
          <div className="projects-loading">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="projects-empty">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
              </svg>
            </div>
            <h2>No Projects Yet</h2>
            <p>Create your first project to get started</p>
            <button 
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
            >
              Create Project
            </button>
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map((project) => (
              <div 
                key={project.id}
                className="project-card"
                onClick={() => handleProjectClick(project.id)}
              >
                <div className="project-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </div>
                <h3>{project.name}</h3>
                {project.description && (
                  <p className="project-description">{project.description}</p>
                )}
                <div className="project-meta">
                  <span>{project.filesCount || 0} files</span>
                  <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onProjectCreated={handleProjectCreated}
        />
      )}
    </div>
  );
};

export default ProjectsPage;
