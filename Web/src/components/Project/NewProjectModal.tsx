import { useState, useRef, type FormEvent } from 'react';
import { FaFileUpload, FaTimes } from 'react-icons/fa';
import api from '../../services/api';
import './NewProjectModal.css';

interface Project {
  id: string;
  name: string;
  description?: string;
}

interface NewProjectModalProps {
  onClose: () => void;
  onProjectCreated: (project: Project) => void;
}

const NewProjectModal = ({ onClose, onProjectCreated }: NewProjectModalProps) => {
  const [projectName, setProjectName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      // Filter only .ifc files
      const ifcFiles = selectedFiles.filter(file => 
        file.name.toLowerCase().endsWith('.ifc')
      );
      setFiles(ifcFiles);
      
      if (ifcFiles.length !== selectedFiles.length) {
        setError('Only IFC files are allowed');
        setTimeout(() => setError(''), 3000);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const ifcFiles = droppedFiles.filter(file => 
        file.name.toLowerCase().endsWith('.ifc')
      );
      setFiles(ifcFiles);
      
      if (ifcFiles.length !== droppedFiles.length) {
        setError('Only IFC files are allowed');
        setTimeout(() => setError(''), 3000);
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }
    
    if (files.length === 0) {
      setError('Please select at least one IFC file');
      return;
    }

    setUploading(true);
    setError('');

    try {
      // 1. Create project
      const projectResponse = await api.post('projects', {
        name: projectName,
        description: `Project with ${files.length} file(s)`
      });
      
      const project = projectResponse.data.project;

      // 2. Upload files
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', project.id);

        await api.post('upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      }

      onProjectCreated(project);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Failed to create project');
      setUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Make new Project</h2>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* File Upload Section */}
          <div className="upload-section">
            <label>Load BIM models</label>
            <div
              className="upload-dropzone"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <FaFileUpload className="dropzone-icon" />
              <p>Drag files here or click to select</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".ifc"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>

            {files.length > 0 && (
              <div className="files-list">
                {files.map((file, index) => (
                  <div key={index} className="file-item">
                    <svg className="file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                      <polyline points="13 2 13 9 20 9"/>
                    </svg>
                    <span className="file-name">{file.name}</span>
                    <button
                      type="button"
                      className="file-remove"
                      onClick={() => removeFile(index)}
                    >
                      <FaTimes />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Project Name Section */}
          <div className="form-group">
            <label htmlFor="projectName">Project Name</label>
            <input
              type="text"
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name"
              required
            />
          </div>

          {/* Actions */}
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={uploading || files.length === 0}
            >
              {uploading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewProjectModal;
