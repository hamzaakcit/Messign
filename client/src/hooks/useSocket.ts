import { useCallback } from 'react';
import { getSocket } from '@/lib/socket';

export function useSocket() {
  const socket = getSocket();

  const emit = useCallback((event: string, data?: any) => {
    socket.emit(event, data);
  }, [socket]);

  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, [socket]);

  const off = useCallback((event: string, callback?: (...args: any[]) => void) => {
    if (callback) {
      socket.off(event, callback);
    } else {
      socket.off(event);
    }
  }, [socket]);

  return { socket, emit, on, off };
}
