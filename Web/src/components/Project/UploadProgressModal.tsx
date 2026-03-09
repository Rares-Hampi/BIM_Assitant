import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFileProgress } from '../../hooks/useFileProgress';
import './UploadProgressModal.css';

interface UploadProgressModalProps {
  fileId: string;
  projectId: string;
  fileName: string;
  onClose: () => void;
}

const UploadProgressModal = ({ fileId, projectId, fileName, onClose }: UploadProgressModalProps) => {
  const navigate = useNavigate();
  const { progress, status, message, error, isComplete, isFailed } = useFileProgress(fileId);

  useEffect(() => {
    if (isComplete) {
      // Wait 2 seconds then navigate to project view
      const timer = setTimeout(() => {
        navigate(`/projects/${projectId}`);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [isComplete, navigate, projectId]);

  const getStatusColor = () => {
    if (isFailed) return '#ef4444';
    if (isComplete) return '#10b981';
    return '#3b82f6';
  };

  return (
    <div className="modal-overlay">
      <div className="progress-modal">
        <div className="progress-modal-header">
          <h2>Converting BIM File</h2>
          {(isFailed || isComplete) && (
            <button className="close-btn" onClick={onClose}>×</button>
          )}
        </div>

        <div className="progress-modal-body">
          <div className="file-info">
            <svg className="file-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
              <polyline points="13 2 13 9 20 9"/>
            </svg>
            <div className="file-details">
              <p className="file-name">{fileName}</p>
              <p className="file-status" style={{ color: getStatusColor() }}>
                {status === 'completed' ? '✓ Complete' : 
                 status === 'failed' ? '✗ Failed' : 
                 '⟳ Processing...'}
              </p>
            </div>
          </div>

          <div className="progress-bar-container">
            <div 
              className="progress-bar-fill" 
              style={{ 
                width: `${progress}%`,
                backgroundColor: getStatusColor()
              }}
            />
          </div>

          <div className="progress-info">
            <span className="progress-percent">{progress}%</span>
            <span className="progress-message">{message}</span>
          </div>

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

          {isComplete && (
            <div className="success-message">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <p>Redirecting to project view...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadProgressModal;
