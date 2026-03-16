import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBatchProgress } from '../../hooks/useBatchProgress';
import './BatchUploadProgressModal.css';

interface BatchUploadProgressModalProps {
  projectId: string;
  onClose: () => void;
}

const BatchUploadProgressModal = ({ projectId, onClose }: BatchUploadProgressModalProps) => {
  const navigate = useNavigate();
  const { files, allComplete, anyFailed, error, totalProgress } = useBatchProgress(projectId);

  useEffect(() => {
    if (allComplete) {
      // Wait 2 seconds then navigate to project view
      const timer = setTimeout(() => {
        navigate(`/projects/${projectId}`);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [allComplete, navigate, projectId]);

  const getFileStatusColor = (status: string) => {
    if (status === 'failed') return '#ef4444';
    if (status === 'completed') return '#10b981';
    return '#3b82f6';
  };

  const getOverallStatusColor = () => {
    if (anyFailed) return '#ef4444';
    if (allComplete) return '#10b981';
    return '#3b82f6';
  };

  return (
    <div className="modal-overlay">
      <div className="batch-progress-modal">
        <div className="progress-modal-header">
          <h2>Converting BIM Files</h2>
          {(anyFailed || allComplete) && (
            <button className="close-btn" onClick={onClose}>×</button>
          )}
        </div>

        <div className="batch-progress-modal-body">
          {/* Overall Progress */}
          <div className="overall-progress">
            <div className="overall-progress-header">
              <h3>Overall Progress</h3>
              <span className="overall-progress-percent">{totalProgress}%</span>
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ 
                  width: `${totalProgress}%`,
                  backgroundColor: getOverallStatusColor()
                }}
              />
            </div>
            <p className="overall-status">
              {files.length} file{files.length !== 1 ? 's' : ''} • {' '}
              {files.filter(f => f.status === 'completed').length} completed • {' '}
              {files.filter(f => f.status === 'processing').length} processing
            </p>
          </div>

          {/* Individual Files */}
          <div className="files-list-progress">
            <h3>Files</h3>
            {files.length === 0 ? (
              <div className="loading-state">
                <p>Loading files...</p>
              </div>
            ) : (
              files.map((file) => (
                <div key={file.id} className="file-progress-item">
                  <div className="file-progress-header">
                    <div className="file-icon-small">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                        <polyline points="13 2 13 9 20 9"/>
                      </svg>
                    </div>
                    <div className="file-progress-details">
                      <p className="file-progress-name">{file.originalName}</p>
                      <p className="file-progress-message">{file.statusMessage}</p>
                    </div>
                    <div className="file-progress-status">
                      <span 
                        className="status-badge"
                        style={{ 
                          backgroundColor: getFileStatusColor(file.status),
                          color: 'white'
                        }}
                      >
                        {file.status === 'completed' ? '✓' : 
                         file.status === 'failed' ? '✗' : 
                         `${file.progress}%`}
                      </span>
                    </div>
                  </div>
                  <div className="file-progress-bar-container">
                    <div 
                      className="file-progress-bar-fill" 
                      style={{ 
                        width: `${file.progress}%`,
                        backgroundColor: getFileStatusColor(file.status)
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="error-message">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p>{error}</p>
            </div>
          )}

          {/* Success Message */}
          {allComplete && !anyFailed && (
            <div className="success-message">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <p>All files converted successfully! Redirecting...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchUploadProgressModal;
