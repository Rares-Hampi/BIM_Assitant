import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Sidebar from '../components/Layout/Sidebar';
import Canvas3D, { type Canvas3DHandle } from '../components/Project/Canvas3D';
import ClashReport from '../components/Report/ClashReport';
import VisualControls from '../components/Project/VisualControls';
import api from '../services/api';
import './ProjectViewPage.css';

interface Project {
  id: string;
  name: string;
  description?: string;
}

const ProjectViewPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const canvasRef = useRef<Canvas3DHandle>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [modelVisibility, setModelVisibility] = useState<Record<string, boolean>>({
    walls: true,
    slabs: true,
    ducts: true,
    pipes: true,
    electrical: true,
    others: true,
  });

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const response = await api.get(`projects/${projectId}`);
      setProject(response.data.project);
    } catch (error) {
      console.error('Failed to fetch project:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleModel = (modelName: string) => {
    setModelVisibility(prev => ({
      ...prev,
      [modelName]: !prev[modelName]
    }));
  };

  const handleResetView = () => {
    canvasRef.current?.resetView();
  };

  if (loading) {
    return (
      <div className="project-view-loading">
        <div className="loading-spinner"></div>
        <p>Loading project...</p>
      </div>
    );
  }

  return (
    <div className="project-view-page">
      <Sidebar />
      
      <div className="project-view-content">
        <div className="project-view-header">
          <h1>{project?.name || 'Project'}</h1>
        </div>

        <div className="project-view-main">
          <VisualControls 
            onToggleModel={handleToggleModel} 
            modelVisibility={modelVisibility}
            onResetView={handleResetView}
          />
          
          <Canvas3D 
            ref={canvasRef} 
            modelVisibility={modelVisibility}
          />
          
          <ClashReport />
        </div>
      </div>
    </div>
  );
};

export default ProjectViewPage;
