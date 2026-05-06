// src/design-system/components/Badge/Badge.jsx
import PropTypes from 'prop-types';
import styles from './Badge.module.css';

export default function Badge({ 
  children, 
  variant = 'default', 
  size = 'md', 
  icon,
  className = '',
  ...rest 
}) {
  const sizeClass = styles[`size${size.charAt(0).toUpperCase() + size.slice(1)}`];
  
  return (
    <span className={`${styles.badge} ${styles[`variant${variant.charAt(0).toUpperCase() + variant.slice(1)}`]} ${sizeClass} ${className}`} {...rest}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.text}>{children}</span>
    </span>
  );
}

Badge.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['default', 'pending', 'live', 'finished', 'scheduled', 'success', 'error']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  icon: PropTypes.node,
  className: PropTypes.string,
};