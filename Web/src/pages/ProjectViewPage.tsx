import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { FiPlay } from "react-icons/fi";
import Sidebar from "../components/Layout/Sidebar";
import Canvas3D, { type Canvas3DHandle } from "../components/Project/Canvas3D";
import ClashReport from "../components/Report/ClashReport";
import ClashProgressModal from "../components/Report/ClashProgressModal";
import VisualControls from "../components/Project/VisualControls";
import api from "../services/api";
import "./ProjectViewPage.css";

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
  clashesData: Clash[];
  createdAt: string;
}

const ProjectViewPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const canvasRef = useRef<Canvas3DHandle>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [clashReport, setClashReport] = useState<ClashReportData | null>(null);
  const [isRunningClash, setIsRunningClash] = useState(false);
  const [clashReportId, setClashReportId] = useState<string | null>(null);
  const [selectedClash, setSelectedClash] = useState<Clash | null>(null);
  const [modelVisibility, setModelVisibility] = useState<
    Record<string, boolean>
  >({
    // MEP Systems
    ducts: true,
    pipes: true,
    electrical: true,

    // Structural/Architectural
    walls: true,
    slabs: true,
    doors: true,
    windows: true,
    columns: true,
    beams: true,
    stairs: true,

    // Furniture & Equipment
    furniture: true,
    equipment: true,

    // Other
    others: true,
  });

  // Memoized clash data
  // const stableClashes = useMemo(() => clashReport?.clashesData || [], [clashReport?.clashesData]);

  // Get clash points for visualization
  const clashPoints = useMemo(() => {
    if (!selectedClash) return [];
    const pos = selectedClash.position || {
      x: selectedClash.position_x ?? 0,
      y: selectedClash.position_y ?? 0,
      z: selectedClash.position_z ?? 0,
    };
    return [
      {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        id: selectedClash.clash_id,
      },
    ];
  }, [selectedClash]);

  // Get available categories from project files
  const availableCategories = useMemo(() => {
    const categoryColors: Record<string, string> = {
      // MEP Systems
      ducts: "#A9A9A9",
      pipes: "#0000FF",
      electrical: "#FFD700",

      // Structural/Architectural
      walls: "#8B4513",
      slabs: "#696969",
      doors: "#CD853F",
      windows: "#87CEEB",
      columns: "#2F4F4F",
      beams: "#556B2F",
      stairs: "#8B0000",

      // Furniture & Equipment
      furniture: "#DEB887",
      equipment: "#BC8F8F",

      // Other
      others: "#808080",
    };

    if (!project?.files) return [];
    const categories = new Set<string>();
    project.files.forEach((file) => {
      if (file.status === "completed" && file.convertedModels) {
        file.convertedModels.forEach((model) => {
          categories.add(model.category);
        });
      }
    });
    return Array.from(categories).map((category) => ({
      name: category,
      label: category.charAt(0).toUpperCase() + category.slice(1),
      color: categoryColors[category] || "#808080",
    }));
  }, [project?.files]);

  // Memoized models from project
  const models = useMemo(() => {
    if (!project?.files || project.files.length === 0) return [];

    const categoryColors: Record<string, string> = {
      // MEP Systems
      ducts: "#A9A9A9",
      pipes: "#0000FF",
      electrical: "#FFD700",

      // Structural/Architectural
      walls: "#8B4513",
      slabs: "#696969",
      doors: "#CD853F",
      windows: "#87CEEB",
      columns: "#2F4F4F",
      beams: "#556B2F",
      stairs: "#8B0000",

      // Furniture & Equipment
      furniture: "#DEB887",
      equipment: "#BC8F8F",

      // Other
      others: "#808080",
    };

    const modelsList: { category: string; url: string; color: string }[] = [];

    project.files.forEach((file) => {
      if (file.status === "completed" && file.convertedModels) {
        file.convertedModels.forEach((model) => {
          const minioUrl = `${import.meta.env.VITE_MINIO_URL}/bim-converted-models/${model.glb_path}`;
          modelsList.push({
            category: model.category,
            url: minioUrl,
            color: categoryColors[model.category] || "#808080",
          });
        });
      }
    });

    return modelsList;
  }, [project?.files]);

  // Memoized handlers
  const handleToggleModel = useCallback((modelName: string) => {
    setModelVisibility((prev) => ({
      ...prev,
      [modelName]: !prev[modelName],
    }));
  }, []);

  const handleClashClick = useCallback((clash: Clash) => {
    setSelectedClash(clash);
  }, []);

  const handleClashPointClickOnCanvas = useCallback(
    (clashId: number) => {
      if (clashReport && clashReport.clashesData) {
        const clash = clashReport.clashesData.find(
          (c) => c.clash_id === clashId,
        );
        if (clash) {
          setSelectedClash(clash);
        }
      }
    },
    [clashReport],
  );

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const response = await api.get(`projects/${projectId}`);
        console.log("Project data:", response.data);
        setProject(response.data.data.project);

        // Fetch latest clash report for this project
        await fetchLatestClashReport();
      } catch (error) {
        console.error("Failed to fetch project:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  // const handleClashClick = useCallback((clash: unknown) => {
  //   // Focus camera on the clash position
  //   const clashData = clash as { clash_id: number };
  //   // canvasRef.current?.focusOnClash(clashData.clash_id);
  // }, []);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const response = await api.get(`projects/${projectId}`);
        console.log("Project data:", response.data);
        setProject(response.data.data.project);

        // Fetch latest clash report for this project
        await fetchLatestClashReport();
      } catch (error) {
        console.error("Failed to fetch project:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  const fetchLatestClashReport = async () => {
    try {
      const response = await api.get(`reports/project/${projectId}`);
      if (response.data.success && response.data.data.reports.length > 0) {
        // Get the most recent report
        const latestReport = response.data.data.reports[0];
        setClashReport(latestReport);
        console.log("Fetched clash reports:", response.data.data.reports);

        console.log("Latest clash report:", latestReport);
      }
    } catch (error) {
      console.error("Failed to fetch clash reports:", error);
    }
  };

  const handleRunClashDetection = async () => {
    if (!project?.files) {
      alert("No files to analyze");
      return;
    }

    const completedFiles = project.files.filter(
      (f) => f.status === "completed",
    );

    if (completedFiles.length === 0) {
      alert(
        "No converted files available. Please wait for file conversion to complete.",
      );
      return;
    }

    try {
      setIsRunningClash(true);

      const fileIds = completedFiles.map((f) => f.id);

      const response = await api.post("reports/generate", {
        projectId,
        fileIds,
        settings: {},
      });

      if (response.data.success) {
        const reportId = response.data.data.report.id;
        setClashReportId(reportId);
        console.log("Clash detection started:", reportId);
      }
    } catch (error: unknown) {
      console.error("Failed to start clash detection:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to start clash detection";
      alert(errorMessage);
      setIsRunningClash(false);
    }
  };

  const handleClashComplete = async () => {
    setIsRunningClash(false);
    setClashReportId(null);

    // Refresh clash report data
    await fetchLatestClashReport();
  };

  const handleCloseProgress = () => {
    setIsRunningClash(false);
    setClashReportId(null);
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
          <div className="project-header-left">
            <h1>{project?.name || "Project"}</h1>
          </div>
          <div className="project-header-actions">
            <button
              className="btn btn-primary btn-clash"
              onClick={handleRunClashDetection}
              disabled={
                isRunningClash ||
                !project?.files?.some((f) => f.status === "completed")
              }
            >
              <FiPlay size={18} />
              {isRunningClash ? "Running..." : "Run Clash Detection"}
            </button>
          </div>
        </div>

        <div className="project-view-main">
          <VisualControls
            onToggleModel={handleToggleModel}
            modelVisibility={modelVisibility}
            onResetView={handleResetView}
            availableModels={availableCategories}
          />

          <Canvas3D
            ref={canvasRef}
            modelVisibility={modelVisibility}
            models={models}
            clashPoints={clashPoints}
            onClashPointClick={handleClashPointClickOnCanvas}
            selectedClashId={selectedClash?.clash_id}
          />

          <ClashReport report={clashReport} onClashClick={handleClashClick} />
        </div>

        {clashReportId && (
          <ClashProgressModal
            reportId={clashReportId}
            projectId={projectId!}
            onComplete={handleClashComplete}
            onClose={handleCloseProgress}
          />
        )}
      </div>
    </div>
  );
};

export default ProjectViewPage;
