import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiPlus, FiTrash2, FiHome, FiClock } from "react-icons/fi";
import NewProjectModal from "../components/Project/NewProjectModal";
import api from "../services/api";
import "./ProjectsPage.css";
import Header from "../components/Layout/Header";

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  files?: Array<{
    id: string;
    status: string;
    originalName: string;
    convertedModels: number | null;
    createdAt: string;
  }>;
  _count?: {
    files: number;
    clashReports: number;
  };
}

const ProjectsPage = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []); // Refetch when projects length changes (e.g., after creating a new project)

  const fetchProjects = async () => {
    try {
      const response = await api.get("projects");
      console.log("Projects response:", response.data);
      setProjects(response.data.data.projects || []);
      console.log(
        "Fetched projects count:",
        response.data.data.projects?.length,
      );
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectClick = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleProjectCreated = (
    newProject: Omit<Project, "createdAt"> & { createdAt?: string },
  ) => {
    const projectWithTimestamp: Project = {
      ...newProject,
      createdAt: newProject.createdAt || new Date().toISOString(),
    };
    setProjects([projectWithTimestamp, ...projects]);
    setShowModal(false);
    // Navigate to the new project
    navigate(`/projects/${newProject.id}`);
  };

  const handleDeleteProject = async (
    projectId: string,
    projectName: string,
    event: React.MouseEvent,
  ) => {
    // Stop propagation to prevent navigating to project
    event.stopPropagation();

    const confirmed = window.confirm(
      `Are you sure you want to delete "${projectName}"?\n\nThis will permanently delete:\n- All files in this project\n- All converted models\n- All clash reports\n\nThis action cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      await api.delete(`projects/${projectId}`);

      // Remove project from state
      setProjects(projects.filter((p) => p.id !== projectId));

      // Show success message
      alert("Project deleted successfully");
    } catch (error) {
      console.error("Failed to delete project:", error);
      alert("Failed to delete project. Please try again.");
    }
  };

  return (
    <>
    <Header isButton={true} buttonText="Log out" />
      <div className="projects-page">
        <div className="projects-content">
          <div className="projects-header">
            <div className="projects-title-section">
              <h1>My Projects</h1>
              <p className="projects-subtitle">
                Manage and monitor your ongoing construction models.
              </p>
            </div>
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
            <div className="projects-grid">
              <div className="project-card new-project-card">
                <div className="new-project-content">
                  <FiPlus size={48} />
                  <p>CREATE NEW PROJECT</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="projects-grid">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="project-card"
                  onClick={() => handleProjectClick(project.id)}
                >
                  <button
                    className="delete-project-btn"
                    onClick={(e) =>
                      handleDeleteProject(project.id, project.name, e)
                    }
                    title="Delete project"
                  >
                    <FiTrash2 size={18} />
                  </button>
                  <div className="project-info">
                    <h3>{project.name}</h3>
                    {project.description && (
                      <p className="project-description">
                        {project.description}
                      </p>
                    )}
                    <div className="project-meta">
                      <div className="meta-item">
                        <FiHome size={16} />
                        <span>{project._count?.files || 0} Files</span>
                      </div>
                      <div className="meta-item">
                        <FiClock size={16} />
                        <span>{project._count?.clashReports || 0} Clashes</span>
                      </div>
                    </div>
                    <p className="project-date">
                      Created {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
              <div
                className="project-card new-project-card"
                onClick={() => setShowModal(true)}
              >
                <div className="new-project-content">
                  <FiPlus size={48} />
                  <p>CREATE NEW PROJECT</p>
                </div>
              </div>
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
    </>
  );
};

export default ProjectsPage;
