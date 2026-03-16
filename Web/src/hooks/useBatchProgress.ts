import { useEffect, useState, useRef } from 'react';

interface FileProgress {
  id: string;
  status: string;
  progress: number;
  statusMessage: string;
  originalName: string;
}

interface BatchProgressEvent {
  type: 'connected' | 'batch_progress' | 'done' | 'error';
  projectId?: string;
  files?: FileProgress[];
  totalFiles?: number;
  message?: string;
}

interface UseBatchProgressReturn {
  files: FileProgress[];
  allComplete: boolean;
  anyFailed: boolean;
  error: string | null;
  totalProgress: number;
}

export const useBatchProgress = (projectId: string | null): UseBatchProgressReturn => {
  const [files, setFiles] = useState<FileProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [allComplete, setAllComplete] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Not authenticated');
      return;
    }

    // Create SSE connection for batch progress
    const url = `${import.meta.env.VITE_API_URL}/progress/batch/${projectId}?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);

    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: BatchProgressEvent = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connected':
            console.log('Batch progress stream connected:', data.message);
            break;
            
          case 'batch_progress':
            if (data.files) {
              setFiles(data.files);
            }
            break;
            
          case 'done':
            setAllComplete(true);
            break;
            
          case 'error':
            setError(data.message || 'Unknown error');
            break;
        }
      } catch (err) {
        console.error('Error parsing SSE message:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      setError('Connection error');
      eventSource.close();
    };

    // Cleanup on unmount
    return () => {
      eventSource.close();
    };
  }, [projectId]);

  // Calculate derived values
  const anyFailed = files.some(f => f.status === 'failed');
  const totalProgress = files.length > 0 
    ? Math.round(files.reduce((acc, f) => acc + f.progress, 0) / files.length)
    : 0;

  return {
    files,
    allComplete,
    anyFailed,
    error,
    totalProgress
  };
};
