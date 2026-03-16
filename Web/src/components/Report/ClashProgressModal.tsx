import React, { useEffect } from 'react';
import { useClashProgress } from '../../hooks/useClashProgress';
import './ClashProgressModal.css';

interface ClashProgressModalProps {
  reportId: string;
  projectId: string;
  onComplete: () => void;
  onClose: () => void;
}

const ClashProgressModal: React.FC<ClashProgressModalProps> = ({
  reportId,
  projectId,
  onComplete,
  onClose,
}) => {
  const { progress, status, message, error, isComplete, isFailed } = useClashProgress(reportId);

  useEffect(() => {
    if (isComplete) {
      setTimeout(() => {
        onComplete();
      }, 2000);
    }
  }, [isComplete, onComplete]);

  const getStatusColor = () => {
    if (isFailed) return '#ef4444';
    if (isComplete) return '#10b981';
    return '#3b82f6';
  };

  const getStatusIcon = () => {
    if (isFailed) return '[FAILED]';
    if (isComplete) return '[DONE]';
    return '[RUNNING]';
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content clash-progress-modal">
        <div className="modal-header">
          <h2>{getStatusIcon()} Clash Detection Progress</h2>
          {!isComplete && !isFailed && (
            <button className="close-btn" onClick={onClose}>×</button>
          )}
        </div>

        <div className="modal-body">
          <div className="progress-info">
            <div className="status-badge" style={{ backgroundColor: getStatusColor() }}>
              {status}
            </div>
            <div className="progress-percentage">{progress}%</div>
          </div>

          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{
                width: `${progress}%`,
                backgroundColor: getStatusColor(),
              }}
            />
          </div>

          <div className="progress-message">
            {error ? (
              <div className="error-message">
                <strong>Error:</strong> {error}
              </div>
            ) : (
              <p>{message}</p>
            )}
          </div>

          {isComplete && (
            <div className="success-message">
              <p>Clash detection completed successfully!</p>
              <p className="redirect-message">Refreshing results...</p>
            </div>
          )}

          {isFailed && (
            <div className="error-actions">
              <button className="btn-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClashProgressModal;
