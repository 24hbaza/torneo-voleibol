// src/design-system/components/Card/Card.jsx
import PropTypes from 'prop-types';
import styles from './Card.module.css';

export default function Card({ 
  title, 
  subtitle, 
  headerAction, 
  children, 
  variant = 'default', 
  className = '',
  ...rest 
}) {
  return (
    <div className={`${styles.card} ${styles[variant]} ${className}`} {...rest}>
      {(title || subtitle || headerAction) && (
        <div className={styles.header}>
          <div className={styles.headerText}>
            {title && <h3 className={styles.title}>{title}</h3>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {headerAction && <div className={styles.headerAction}>{headerAction}</div>}
        </div>
      )}
      <div className={styles.content}>{children}</div>
    </div>
  );
}

Card.propTypes = {
  title: PropTypes.node,
  subtitle: PropTypes.node,
  headerAction: PropTypes.node,
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['default', 'highlighted', 'ghost']),
  className: PropTypes.string,
};