import React, { useState } from 'react';
import './ClashReport.css';

interface SampleElement {
  id: string;
  name: string;
  type: string;
  bbox?: number[];
  centroid?: number[];
}

interface ClashObject {
  file_id: string;
  file_name: string;
  category: string;
  element_count: number;
  element_ids?: string[];
  sample_element?: SampleElement;
}

interface Clash {
  clash_id: number;
  severity: string;
  penetration_depth: number;
  clearance_required: number;
  position: { x: number; y: number; z: number };
  object1: ClashObject;
  object2: ClashObject;
  // Legacy fields for backward compatibility
  object1_file_id?: string;
  object1_category?: string;
  object2_file_id?: string;
  object2_category?: string;
  position_x?: number;
  position_y?: number;
  position_z?: number;
}

interface ClashReportData {
  id: string;
  status: string;
  totalClashes: number;
  criticalClashes: number;
  majorClashes: number;
  minorClashes: number;
  clashesData?: Clash[];
  createdAt: string;
}

interface ClashReportProps {
  report: ClashReportData | null;
  onClashClick?: (clash: Clash) => void;
}

const ClashReport: React.FC<ClashReportProps> = ({ report, onClashClick }) => {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  if (!report) {
    return (
      <div className="clash-report">
        <div className="no-report">
          <p>No clash detection results available.</p>
          <p className="hint">Run clash detection to analyze conflicts between building elements.</p>
        </div>
      </div>
    );
  }

  if (report.status === 'processing') {
    return (
      <div className="clash-report">
        <div className="processing-state">
          <div className="spinner"></div>
          <p>Clash detection in progress...</p>
        </div>
      </div>
    );
  }

  if (report.status === 'failed') {
    return (
      <div className="clash-report">
        <div className="error-state">
          <p>Clash detection failed</p>
        </div>
      </div>
    );
  }

  const clashes = report.clashesData || [];

  // Filter clashes
  const filteredClashes = clashes.filter(clash => {
    if (selectedSeverity !== 'all' && clash.severity !== selectedSeverity) {
      return false;
    }
    if (selectedCategory !== 'all') {
      const cat1 = clash.object1?.category || clash.object1_category || '';
      const cat2 = clash.object2?.category || clash.object2_category || '';
      if (cat1 !== selectedCategory && cat2 !== selectedCategory) {
        return false;
      }
    }
    return true;
  });

  // Get unique categories (support both formats)
  const categories = Array.from(
    new Set(clashes.flatMap(c => [
      c.object1?.category || c.object1_category,
      c.object2?.category || c.object2_category
    ].filter(Boolean)))
  ).sort() as string[];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#ef4444';
      case 'major': return '#f59e0b';
      case 'minor': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  return (
    <div className="clash-report">
      <div className="clash-header">
        <h3 className="clash-title">Clash Detection Results</h3>
        <div className="clash-summary">
          <div className="summary-card total">
            <div className="summary-label">Total</div>
            <div className="summary-value">{report.totalClashes}</div>
          </div>
          <div className="summary-card critical">
            <div className="summary-label">Critical</div>
            <div className="summary-value">{report.criticalClashes}</div>
          </div>
          <div className="summary-card major">
            <div className="summary-label">Major</div>
            <div className="summary-value">{report.majorClashes}</div>
          </div>
          <div className="summary-card minor">
            <div className="summary-label">Minor</div>
            <div className="summary-value">{report.minorClashes}</div>
          </div>
        </div>
      </div>

      <div className="clash-filters">
        <div className="filter-group">
          <label>Severity:</label>
          <select 
            value={selectedSeverity} 
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="filter-select"
          >
            <option value="all">All ({clashes.length})</option>
            <option value="critical">Critical ({report.criticalClashes})</option>
            <option value="major">Major ({report.majorClashes})</option>
            <option value="minor">Minor ({report.minorClashes})</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Category:</label>
          <select 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="clash-list">
        {filteredClashes.length === 0 ? (
          <div className="no-clashes">
            <p>No clashes found with current filters.</p>
          </div>
        ) : (
          filteredClashes.map((clash) => (
            <div 
              key={clash.clash_id} 
              className="clash-item"
              onClick={() => onClashClick?.(clash)}
              style={{ cursor: onClashClick ? 'pointer' : 'default' }}
            >
              <div className="clash-item-header">
                <span 
                  className="severity-badge"
                  style={{ backgroundColor: getSeverityColor(clash.severity) }}
                >
                  {clash.severity}
                </span>
                <span className="clash-id">Clash #{clash.clash_id}</span>
              </div>
              
              <div className="clash-item-body">
                <div className="clash-objects">
                  <div className="clash-object">
                    <span className="object-label">Object 1:</span>
                    <span className="object-category">
                      {clash.object1?.category || clash.object1_category}
                    </span>
                    {clash.object1?.sample_element && (
                      <div className="element-details">
                        <div className="element-name">{clash.object1.sample_element.name}</div>
                        <div className="element-type">{clash.object1.sample_element.type}</div>
                      </div>
                    )}
                  </div>
                  <div className="clash-divider">vs</div>
                  <div className="clash-object">
                    <span className="object-label">Object 2:</span>
                    <span className="object-category">
                      {clash.object2?.category || clash.object2_category}
                    </span>
                    {clash.object2?.sample_element && (
                      <div className="element-details">
                        <div className="element-name">{clash.object2.sample_element.name}</div>
                        <div className="element-type">{clash.object2.sample_element.type}</div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="clash-details">
                  <div className="detail-item">
                    <span className="detail-label">Penetration:</span>
                    <span className="detail-value">
                      {(clash.penetration_depth * 100).toFixed(2)} cm
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Position:</span>
                    <span className="detail-value">
                      {clash.position ? 
                        `(${clash.position.x.toFixed(2)}, ${clash.position.y.toFixed(2)}, ${clash.position.z.toFixed(2)})` :
                        `(${clash.position_x?.toFixed(2)}, ${clash.position_y?.toFixed(2)}, ${clash.position_z?.toFixed(2)})`
                      }
                    </span>
                  </div>
                  {clash.clearance_required > 0 && (
                    <div className="detail-item">
                      <span className="detail-label">Required Clearance:</span>
                      <span className="detail-value">
                        {(clash.clearance_required * 100).toFixed(2)} cm
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ClashReport;
