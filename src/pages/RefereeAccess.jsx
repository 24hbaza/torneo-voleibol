// src/pages/RefereeAccess.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../design-system/components';
import styles from './RefereeAccess.module.css';

export default function RefereeAccess() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError('⚠️ Introduce el código de acceso');
      setLoading(false);
      return;
    }

    try {
      // Buscar partido con ese código de verificación
      const { data, error: queryError } = await supabase
        .from('matches')
        .select('id, status')
        .eq('verification_code', cleanCode)
        .single();

      if (queryError || !data) {
        setError('❌ Código incorrecto. Verifica con la organización.');
        setLoading(false);
        return;
      }

      // Redirigir al marcador del partido encontrado
      navigate(`/arbitro/partido/${data.id}`);
    } catch (err) {
      console.error('Referee access error:', err);
      setError('❌ Error de conexión. Intenta de nuevo.');
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  return (
    <div className={styles.container}>
      {/* Fondo decorativo */}
      <div className={styles.background}>
        <div className={styles.blob}></div>
        <div className={styles.blob}></div>
        <div className={styles.blob}></div>
      </div>

      {/* Panel de acceso */}
      <div className={styles.accessCard}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>🟥</span>
            <h1>Acceso Árbitro</h1>
          </div>
          <p className={styles.subtitle}>Introduce el código para gestionar el marcador en directo</p>
        </header>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="code" className={styles.label}>Código de Partido</label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ej: A1B2C3"
              className={styles.codeInput}
              maxLength={6}
              autoComplete="off"
              autoCapitalize="characters"
              autoFocus
            />
            <p className={styles.hint}>El código te lo proporciona la organización o aparece en tu panel de "Mis Partidos"</p>
          </div>

          {error && <div className={styles.errorBox}>{error}</div>}

          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={handleBack} className={styles.backBtn}>
              ← Salir
            </Button>
            <Button 
              type="submit" 
              variant="primary" 
              loading={loading} 
              disabled={loading || code.length < 6}
              className={styles.submitBtn}
            >
              {loading ? 'Verificando...' : 'Acceder al Marcador'}
            </Button>
          </div>
        </form>

        {/* Info adicional */}
        <div className={styles.infoBox}>
          <h4>💡 ¿Cómo funciona?</h4>
          <ol>
            <li>Recibe el código de 6 caracteres para tu partido asignado.</li>
            <li>Introdúcelo arriba y pulsa "Acceder".</li>
            <li>Controla el marcador en tiempo real y vota al MVP al finalizar.</li>
          </ol>
        </div>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>🏐 VoleyTournament • Panel de Árbitros</p>
      </footer>
    </div>
  );
}