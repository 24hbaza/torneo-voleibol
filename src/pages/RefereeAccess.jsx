import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../design-system/components';
import styles from './RefereeAccess.module.css';

export default function RefereeAccess() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAccess = async function(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!code.trim()) {
      setError('Por favor, introduce el código de acceso.');
      setLoading(false);
      return;
    }

    try {
      // ✅ CORRECCIÓN CLAVE: Supabase devuelve { data, error }
      // Renombramos 'data' a 'matchData' usando: data: matchData
      const { data: matchData, error: queryError } = await supabase
        .from('matches')
        .select('*')
        .eq('verification_code', code.trim());

      // 🔍 LOGS DE DEPURACIÓN (útiles para desarrollo)
      console.log('MATCHES ENCONTRADOS:', matchData);
      console.log('ERROR QUERY:', queryError);

      if (queryError) {
        throw queryError;
      }

      if (!matchData || matchData.length === 0) {
        setError('Código no válido. Verifica e inténtalo de nuevo.');
        setLoading(false);
        return;
      }

      setSuccess('¡Acceso concedido! Redirigiendo al marcador...');
      
      setTimeout(function() {
        navigate('/arbitro/partido/' + matchData[0].id);
      }, 1200);

    } catch (err) {
      setError('Error al verificar el código. Inténtalo más tarde.');
      console.error('Referee access error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.iconWrapper}>🟥</div>
          <h1 className={styles.title}>Acceso Árbitro</h1>
          <p className={styles.subtitle}>
            Introduce el código único del partido para gestionar el marcador en tiempo real.
          </p>
        </div>

        <form onSubmit={handleAccess} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="refereeCode" className={styles.label}>
              Código del Partido
            </label>
            <input
              id="refereeCode"
              type="text"
              className={styles.input}
              placeholder="Ej: VLY-2026-X7K9"
              value={code}
              onChange={function(e) {
                setCode(e.target.value);
              }}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={loading}
            />
            <p className={styles.hint}>
              El código lo proporciona la organización antes de cada partido.
            </p>
          </div>

          {error && (
            <div className={styles.message + ' ' + styles.error}>
              {error}
            </div>
          )}
          
          {success && (
            <div className={styles.message + ' ' + styles.success}>
              {success}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className={styles.submitBtn}
            disabled={loading || !code.trim()}
          >
            {loading ? 'Verificando código...' : 'Acceder al Marcador'}
          </Button>
        </form>

        <div className={styles.footer}>
          <Link to="/dashboard" className={styles.menuBackBtn}>
            ← Volver al Menú Principal
          </Link>
        </div>
      </div>
    </div>
  );
}