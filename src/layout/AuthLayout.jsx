// src/layout/AuthLayout.jsx
import styles from './AuthLayout.module.css';

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div className={styles.container}>
      <div className={styles.bgDecoration} />
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.logo}>🏐</span>
          <h1>24h voleibol Baza</h1>
        </div>
        <div className={styles.content}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          <div className={styles.formContainer}>{children}</div>
        </div>
      </div>
    </div>
  );
}