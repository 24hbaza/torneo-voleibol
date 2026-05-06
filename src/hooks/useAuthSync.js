// src/hooks/useAuthSync.js
import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';

export function useAuthSync() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const syncProfile = async (session) => {
      if (!session?.user) {
        if (mounted) clearAuth();
        return;
      }
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (mounted) {
          // PGRST116 = no rows found (normal si aún no se inscribió)
          if (error && error.code !== 'PGRST116') {
            console.warn('⚠️ AuthSync: Profile fetch error', error.message);
          }
          setAuth({ user: session.user, profile: profile || null });
        }
      } catch (err) {
        console.error('❌ AuthSync error:', err);
        if (mounted) clearAuth();
      }
    };

    // 1. Carga inicial
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        syncProfile(session);
      })
      .catch((err) => {
        console.error('❌ getSession error:', err);
        if (mounted) clearAuth();
      });

    // 2. Escuchar cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncProfile(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [setAuth, clearAuth, setLoading]);
}