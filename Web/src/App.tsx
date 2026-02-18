import { useState, useRef } from 'react';
import './App.css';
import Sidebar from './components/Layout/Sidebar';
import Canvas3D, { type Canvas3DHandle } from './components/Project/Canvas3D';
import ClashReport from './components/Report/ClashReport';
import VisualControls from './components/Project/VisualControls';

function App() {
  const canvasRef = useRef<Canvas3DHandle>(null);
  const [modelVisibility, setModelVisibility] = useState<Record<string, boolean>>({
    structural: true,
    walls: true,
    ducts: true,
    electrical: true,
    pipes: true,
  });

  const handleToggleModel = (modelName: string) => {
    setModelVisibility(prev => ({
      ...prev,
      [modelName]: !prev[modelName]
    }));
  };

  const handleResetView = () => {
    canvasRef.current?.resetView();
  };

  return (
    <div className="app">
      <Sidebar />
      <VisualControls 
        onToggleModel={handleToggleModel} 
        modelVisibility={modelVisibility}
        onResetView={handleResetView}
      />
      <Canvas3D ref={canvasRef} modelVisibility={modelVisibility} />
      <ClashReport />
    </div>
  );
}

export default App;
