import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,

      setAuth: ({ user, profile }) => set({ 
        user, 
        profile: profile || null,
        isLoading: false, 
        isAuthenticated: !!user // ✅ CORREGIDO: Depende del usuario, no del perfil
      }),

      clearAuth: () => set({ 
        user: null, 
        profile: null, 
        isLoading: false, 
        isAuthenticated: false 
      }),

      setLoading: (status) => set({ isLoading: status }),
      updateProfile: (newProfile) => set((state) => ({ 
        profile: { ...state.profile, ...newProfile } 
      }))
    }),
    { name: 'volley-auth-storage' }
  )
);