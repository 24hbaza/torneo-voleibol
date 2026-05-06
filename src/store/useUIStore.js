// src/store/useUIStore.js
import { create } from 'zustand';

export const useUIStore = create((set) => ({
  theme: 'dark',
  sidebarOpen: window.innerWidth > 768,
  notifications: [],
  activeRoute: '',

  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveRoute: (route) => set({ activeRoute: route }),
  
  addNotification: (notif) => set((state) => ({ 
    notifications: [...state.notifications, { id: Date.now(), ...notif }] 
  })),
  removeNotification: (id) => set((state) => ({ 
    notifications: state.notifications.filter(n => n.id !== id) 
  })),
  clearNotifications: () => set({ notifications: [] })
}));