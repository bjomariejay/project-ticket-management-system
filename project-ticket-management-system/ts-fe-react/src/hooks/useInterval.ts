import { useEffect, useRef } from 'react';

export const useInterval = (callback: () => void, delay: number | null) => {
  const savedCallback = useRef<() => void>();

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return undefined;
    const id = window.setInterval(() => {
      savedCallback.current?.();
    }, delay);
    return () => window.clearInterval(id);
  }, [delay]);
};
