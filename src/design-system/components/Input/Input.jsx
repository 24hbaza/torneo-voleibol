// src/design-system/components/Input/Input.jsx
import PropTypes from 'prop-types';
import { forwardRef } from 'react';
import styles from './Input.module.css';

const Input = forwardRef(function Input({
  label,
  error,
  helper,
  iconLeft,
  iconRight,
  fullWidth = false,
  className = '',
  ...props
}, ref) {
  const hasIcon = iconLeft || iconRight;
  
  return (
    <div className={`${styles.wrapper} ${fullWidth ? styles.fullWidth : ''} ${className}`}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={`${styles.inputWrapper} ${hasIcon ? styles.hasIcon : ''} ${error ? styles.hasError : ''}`}>
        {iconLeft && <span className={styles.iconLeft}>{iconLeft}</span>}
        <input ref={ref} className={styles.input} {...props} />
        {iconRight && <span className={styles.iconRight}>{iconRight}</span>}
      </div>
      {(error || helper) && (
        <p className={error ? styles.errorText : styles.helperText}>
          {error || helper}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

Input.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  helper: PropTypes.string,
  iconLeft: PropTypes.node,
  iconRight: PropTypes.node,
  fullWidth: PropTypes.bool,
  className: PropTypes.string,
};

export default Input;