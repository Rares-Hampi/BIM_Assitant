import { useEffect, useState, useRef } from 'react';

interface ProgressEvent {
  type: 'connected' | 'progress' | 'done' | 'error';
  fileId?: string;
  status?: string;
  progress?: number;
  message?: string;
  error?: string;
}

interface UseFileProgressReturn {
  progress: number;
  status: string;
  message: string;
  error: string | null;
  isComplete: boolean;
  isFailed: boolean;
}

export const useFileProgress = (fileId: string | null): UseFileProgressReturn => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('pending');
  const [message, setMessage] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!fileId) return;

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Not authenticated');
      return;
    }

    // Create SSE connection with token as query parameter
    const url = `${import.meta.env.VITE_API_URL}/progress/${fileId}?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);

    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connected':
            console.log('Progress stream connected:', data.message);
            break;
            
          case 'progress':
            setProgress(data.progress || 0);
            setStatus(data.status || 'processing');
            setMessage(data.message || 'Processing...');
            if (data.error) {
              setError(data.error);
            }
            break;
            
          case 'done':
            setProgress(100);
            setStatus(data.status || 'completed');
            setMessage(data.message || 'Complete');
            break;
            
          case 'error':
            setError(data.message || 'Unknown error');
            setStatus('failed');
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
  }, [fileId]);

  return {
    progress,
    status,
    message,
    error,
    isComplete: status === 'completed',
    isFailed: status === 'failed'
  };
};
