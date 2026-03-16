import { useState, useEffect } from 'react';

interface ClashProgressData {
  type: string;
  reportId: string;
  status: string;
  progress: number;
  message?: string;
  error?: string;
}

interface UseClashProgressReturn {
  progress: number;
  status: string;
  message: string;
  error: string | null;
  isComplete: boolean;
  isFailed: boolean;
}

export const useClashProgress = (reportId: string | null): UseClashProgressReturn => {
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<string>('pending');
  const [message, setMessage] = useState<string>('Starting clash detection...');
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [isFailed, setIsFailed] = useState<boolean>(false);

  useEffect(() => {
    if (!reportId) return;

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Authentication required');
      setIsFailed(true);
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    const eventSourceUrl = `${apiUrl}/progress/clash/${reportId}?token=${token}`;

    console.log('[ClashProgress] Connecting to:', eventSourceUrl);

    const eventSource = new EventSource(eventSourceUrl);

    eventSource.onopen = () => {
      console.log('[ClashProgress] SSE connection opened');
    };

    eventSource.onmessage = (event) => {
      try {
        const data: ClashProgressData = JSON.parse(event.data);
        console.log('[ClashProgress] Received:', data);

        if (data.type === 'connected') {
          console.log('[ClashProgress] Connected successfully');
          return;
        }

        if (data.type === 'progress') {
          setProgress(data.progress || 0);
          setStatus(data.status || 'processing');
          setMessage(data.message || 'Processing...');
        }

        if (data.type === 'done') {
          setProgress(100);
          setStatus('completed');
          setMessage(data.message || 'Clash detection completed');
          setIsComplete(true);
          eventSource.close();
          console.log('[ClashProgress] Completed successfully');
        }

        if (data.type === 'error') {
          setError(data.error || 'Unknown error occurred');
          setStatus('failed');
          setIsFailed(true);
          eventSource.close();
          console.error('[ClashProgress] Error:', data.error);
        }
      } catch (err) {
        console.error('[ClashProgress] Failed to parse event data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[ClashProgress] EventSource error:', err);
      setError('Connection lost');
      setIsFailed(true);
      eventSource.close();
    };

    return () => {
      console.log('[ClashProgress] Cleaning up connection');
      eventSource.close();
    };
  }, [reportId]);

  return {
    progress,
    status,
    message,
    error,
    isComplete,
    isFailed,
  };
};
