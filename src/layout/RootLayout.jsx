// src/layout/RootLayout.jsx
import { useEffect } from 'react';
import { useUIStore } from '../store';
import styles from './RootLayout.module.css';

export default function RootLayout({ children }) {
  const { theme } = useUIStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className={styles.root}>
      {children}
    </div>
  );
}