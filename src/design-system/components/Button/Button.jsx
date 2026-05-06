// src/design-system/components/Button/Button.jsx
import PropTypes from 'prop-types';
import styles from './Button.module.css';

/**
 * Componente Button - Sistema de Diseño Volley Pro
 * @param {Object} props
 * @param {'primary'|'success'|'warning'|'danger'|'ghost'} props.variant - Estilo visual del botón
 * @param {'sm'|'md'|'lg'} props.size - Tamaño del botón
 * @param {boolean} props.loading - Estado de carga (muestra spinner)
 * @param {boolean} props.fullWidth - Ocupa el 100% del ancho disponible
 * @param {React.ReactNode} props.children - Contenido del botón
 * @param {Function} props.onClick - Handler de click
 * @param {boolean} props.disabled - Estado deshabilitado
 * @param {string} props.className - Clases CSS adicionales
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  children,
  onClick,
  disabled = false,
  className = '',
  type = 'button',
  ...rest
}) {
  const variantClass = styles[`btn${variant.charAt(0).toUpperCase() + variant.slice(1)}`];
  const sizeClass = styles[`btn${size.toUpperCase()}`];
  
  const buttonClasses = `
    ${styles.button}
    ${variantClass}
    ${sizeClass}
    ${fullWidth ? styles.fullWidth : ''}
    ${loading ? styles.loading : ''}
    ${className}
  `.trim();

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true"></span>}
      <span className={loading ? styles.hidden : ''}>{children}</span>
    </button>
  );
}

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'success', 'warning', 'danger', 'ghost']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  loading: PropTypes.bool,
  fullWidth: PropTypes.bool,
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
};