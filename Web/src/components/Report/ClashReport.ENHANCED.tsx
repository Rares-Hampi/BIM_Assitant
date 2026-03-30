import React, { useState, useMemo } from 'react';
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

type SortBy = 'severity' | 'penetration' | 'id';

const ClashReport: React.FC<ClashReportProps> = ({ report, onClashClick }) => {
  // ALL HOOKS MUST BE AT TOP BEFORE ANY EARLY RETURNS
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('severity');
  const [expandedClash, setExpandedClash] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Get clashes and categories with memoization
  const clashes = useMemo(() => report?.clashesData || [], [report?.clashesData]);

  const categories = useMemo(() => {
    return Array.from(
      new Set(clashes.flatMap(c => [
        c.object1?.category || c.object1_category,
        c.object2?.category || c.object2_category
      ].filter(Boolean)))
    ).sort() as string[];
  }, [clashes]);

  // Filter clashes
  const filteredClashes = useMemo(() => {
    return clashes.filter(clash => {
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
  }, [clashes, selectedSeverity, selectedCategory]);

  // Sort clashes
  const sortedClashes = useMemo(() => {
    const sorted = [...filteredClashes];
    
    switch (sortBy) {
      case 'severity': {
        const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2 };
        sorted.sort((a, b) => 
          (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
        );
        break;
      }
      case 'penetration':
        sorted.sort((a, b) => b.penetration_depth - a.penetration_depth);
        break;
      case 'id':
        sorted.sort((a, b) => a.clash_id - b.clash_id);
        break;
      default:
        break;
    }
    
    return sorted;
  }, [filteredClashes, sortBy]);

  // Helper: Get color for severity badge
  const getSeverityColor = (severity: string): string => {
    const colors: Record<string, string> = {
      critical: '#ef4444',
      major: '#f59e0b',
      minor: '#3b82f6',
    };
    return colors[severity] || '#6b7280';
  };

  // Helper: Get background color for severity
  const getSeverityBgColor = (severity: string): string => {
    const bgColors: Record<string, string> = {
      critical: '#fef2f2',
      major: '#fffbf0',
      minor: '#f0f9ff',
    };
    return bgColors[severity] || '#f3f4f6';
  };

  // Helper: Copy to clipboard with feedback
  const copyToClipboard = (text: string, clashId: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(clashId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper: Export clashes to CSV
  const exportToCSV = (clashesToExport: Clash[]) => {
    let csv = 'Clash ID,Severity,Penetration (cm),Clearance (cm),Object 1,Object 2,Position X,Position Y,Position Z\n';
    
    clashesToExport.forEach(clash => {
      const obj1 = clash.object1?.category || clash.object1_category || 'N/A';
      const obj2 = clash.object2?.category || clash.object2_category || 'N/A';
      const pos = clash.position || { 
        x: clash.position_x ?? 0, 
        y: clash.position_y ?? 0, 
        z: clash.position_z ?? 0 
      };
      
      csv += `${clash.clash_id},${clash.severity},${(clash.penetration_depth * 100).toFixed(2)},${(clash.clearance_required * 100).toFixed(2)},${obj1},${obj2},${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)}\n`;
    });
    
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
    element.setAttribute('download', `clash-report-${report?.id || 'export'}.csv`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // NOW WE CAN HAVE EARLY RETURNS
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

      <div className="clash-toolbar">
        <div className="toolbar-group">
          <label>Sort:</label>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="toolbar-select"
          >
            <option value="severity">Severity</option>
            <option value="penetration">Penetration</option>
            <option value="id">ID</option>
          </select>
        </div>
        <button 
          className="export-btn" 
          onClick={() => exportToCSV(sortedClashes)}
          title="Export to CSV"
        >
          ↓ CSV
        </button>
      </div>

      <div className="clash-list">
        {sortedClashes.length === 0 ? (
          <div className="no-clashes">
            <p>No clashes found with current filters.</p>
          </div>
        ) : (
          sortedClashes.map((clash) => (
            <div 
              key={clash.clash_id} 
              className={`clash-item ${expandedClash === clash.clash_id ? 'expanded' : ''}`}
              style={{ backgroundColor: getSeverityBgColor(clash.severity) }}
            >
              <div 
                className="clash-item-header"
                onClick={() => {
                  setExpandedClash(expandedClash === clash.clash_id ? null : clash.clash_id);
                  onClashClick?.(clash);
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="clash-item-title">
                  <span 
                    className="severity-badge"
                    style={{ backgroundColor: getSeverityColor(clash.severity) }}
                  >
                    {clash.severity.toUpperCase()}
                  </span>
                  <span className="clash-id">#{clash.clash_id}</span>
                  <span className="clash-brief">
                    {(clash.object1?.category || clash.object1_category || 'N/A')} vs {(clash.object2?.category || clash.object2_category || 'N/A')}
                  </span>
                </div>
                <div className="clash-item-meta">
                  <span className="meta-value">{(clash.penetration_depth * 100).toFixed(1)}cm</span>
                  <span className="expand-icon">{expandedClash === clash.clash_id ? '▼' : '▶'}</span>
                </div>
              </div>
              
              {expandedClash === clash.clash_id && (
                <div className="clash-item-body">
                  <div className="clash-objects">
                    <div className="clash-object">
                      <span className="object-label">Object 1</span>
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
                      <span className="object-label">Object 2</span>
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
                      <span className="detail-label">Clearance:</span>
                      <span className="detail-value">
                        {(clash.clearance_required * 100).toFixed(2)} cm
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Position:</span>
                      <button 
                        className="copy-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          const pos = clash.position || { 
                            x: clash.position_x ?? 0, 
                            y: clash.position_y ?? 0, 
                            z: clash.position_z ?? 0 
                          };
                          copyToClipboard(`${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`, clash.clash_id);
                        }}
                        title={copiedId === clash.clash_id ? "Copied!" : "Copy coordinates"}
                      >
                        <span className="detail-value">
                          {clash.position ? 
                            `(${clash.position.x.toFixed(2)}, ${clash.position.y.toFixed(2)}, ${clash.position.z.toFixed(2)})` :
                            `(${clash.position_x?.toFixed(2)}, ${clash.position_y?.toFixed(2)}, ${clash.position_z?.toFixed(2)})`
                          }
                        </span>
                        <span className="copy-icon">{copiedId === clash.clash_id ? '✓' : '📋'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ClashReport;
