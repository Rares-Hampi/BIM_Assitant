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
  files?: BIMFile[];
}

interface BIMFile {
  id: string;
  fileName: string;
  originalName: string;
  status: string;
  convertedModels?: {
    category: string;
    glb_path: string;
    json_path: string;
    element_count: number;
  }[];
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
    const fetchProject = async () => {
      try {
        const response = await api.get(`projects/${projectId}`);
        console.log('Project data:', response.data);
        setProject(response.data.data.project);
      } catch (error) {
        console.error('Failed to fetch project:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProject();
  }, [projectId]);

  const handleToggleModel = (modelName: string) => {
    setModelVisibility(prev => ({
      ...prev,
      [modelName]: !prev[modelName]
    }));
  };

  const handleResetView = () => {
    canvasRef.current?.resetView();
  };

  // Build models array from project files
  const getModelsFromProject = () => {
    if (!project?.files || project.files.length === 0) return [];
    
    const categoryColors: Record<string, string> = {
      walls: '#000000',
      slabs: '#808080',
      ducts: '#A9A9A9',
      pipes: '#0000FF',
      electrical: '#FFD700',
      others: '#808080',
    };
    
    const models: { category: string; url: string; color: string }[] = [];
    
    project.files.forEach(file => {
      if (file.status === 'completed' && file.convertedModels) {
        file.convertedModels.forEach(model => {
          const minioUrl = `${import.meta.env.VITE_MINIO_URL}/bim-converted-models/${model.glb_path}`;
          models.push({
            category: model.category,
            url: minioUrl,
            color: categoryColors[model.category] || '#808080'
          });
        });
      }
    });
    
    return models;
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
            models={getModelsFromProject()}
          />
          
          <ClashReport />
        </div>
      </div>
    </div>
  );
};

export default ProjectViewPage;
