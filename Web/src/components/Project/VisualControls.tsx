import React from 'react';
import './VisualControls.css';

interface VisualControlsProps {
    onToggleModel: (modelName: string) => void;
    modelVisibility: Record<string, boolean>;
    onResetView: () => void;
}

const VisualControls: React.FC<VisualControlsProps> = ({ 
    onToggleModel, 
    modelVisibility,
    onResetView 
}) => {
    const models = [
        { name: 'structural', label: 'Structural', color: '#808080' },
        { name: 'walls', label: 'Walls', color: '#000000' },
        { name: 'ducts', label: 'Sanitar', color: '#A9A9A9' },
        { name: 'electrical', label: 'Electric', color: '#FFD700' },
        { name: 'pipes', label: 'Pipes', color: '#0000FF' },
    ];

    return (
        <div className="visual-controls">
            <h3 className="controls-title">Visual controls</h3>
            <div className="controls-list">
                {models.map((model) => (
                    <div key={model.name} className="control-item">
                        <div className="control-label">
                            <span className="color-indicator" style={{ backgroundColor: model.color }}></span>
                            {model.label}
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={modelVisibility[model.name] !== false}
                                onChange={() => onToggleModel(model.name)}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>
                ))}
            </div>
            <button className="reset-view-btn" onClick={onResetView}>
                 Reset View
            </button>
        </div>
    );
};

export default VisualControls;
