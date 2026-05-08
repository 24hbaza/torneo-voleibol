import { useState, useEffect, useCallback } from 'react';

export function useGuestMode() {
  const [isGuest, setIsGuest] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('voley_guest') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const sync = () => {
      try {
        setIsGuest(localStorage.getItem('voley_guest') === 'true');
      } catch {
        setIsGuest(false);
      }
    };
    
    window.addEventListener('storage', sync);
    window.addEventListener('guestModeChanged', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('guestModeChanged', sync);
    };
  }, []);

  const enableGuest = useCallback(() => {
    localStorage.setItem('voley_guest', 'true');
    window.dispatchEvent(new Event('guestModeChanged'));
  }, []);

  const disableGuest = useCallback(() => {
    localStorage.removeItem('voley_guest');
    window.dispatchEvent(new Event('guestModeChanged'));
  }, []);

  return { isGuest, enableGuest, disableGuest };
}