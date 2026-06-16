// src/pages/StandingsView.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useStandings } from '../features/standings/hooks/useStandings';
import { calculateGroupStandings } from '../features/standings/utils/calculateStandings';
import GroupStandings from '../features/standings/components/GroupStandings';
import styles from './StandingsView.module.css';

export default function StandingsView() {
  const { groups, assignments, matches, loading, error } = useStandings();
  const [advancingCount, setAdvancingCount] = useState(2);
  const [calculatedData, setCalculatedData] = useState([]);
  const [calendarGenerated, setCalendarGenerated] = useState(false);
  const [checkingCalendar, setCheckingCalendar] = useState(true);

  // Obtener configuración de equipos que avanzan
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data, error: cfgError } = await supabase
          .from('tournament_config')
          .select('teams_advancing')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cfgError && data?.teams_advancing) {
          setAdvancingCount(data.teams_advancing);
        }
      } catch (err) {
        console.warn('⚠️ Config no encontrada, usando default (2)');
      }
    };
    fetchConfig();
  }, []);

  // ✅ Verificar si el calendario ya fue generado
  useEffect(() => {
    const checkCalendarStatus = async () => {
      setCheckingCalendar(true);
      try {
        // Verificar si hay partidos de fase de grupos creados
        const { data: groupMatches } = await supabase
          .from('matches')
          .select('id')
          .eq('phase', 'group')
          .limit(1);
        
        // Verificar si draw_completed es true en la configuración
        const { data: config } = await supabase
          .from('tournament_config')
          .select('draw_completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        // El calendario se considera generado si:
        // 1. Hay partidos de fase de grupos, O
        // 2. draw_completed es true
        const hasMatches = groupMatches && groupMatches.length > 0;
        const drawIsCompleted = config?.draw_completed === true;
        
        setCalendarGenerated(hasMatches || drawIsCompleted);
        
      } catch (err) {
        console.error('Error checking calendar:', err);
        setCalendarGenerated(false);
      } finally {
        setCheckingCalendar(false);
      }
    };
    
    checkCalendarStatus();
  }, []);

  // Calcular standings cuando cambien los datos
  useEffect(() => {
    const buildStandings = async () => {
      if (!groups || !assignments || !matches) return;

      const data = await Promise.all(
        groups.map(async group => {
          // Detección de grupos playoff
          const isPlayoffGroup = 
            group.name?.includes('Playoffs') || 
            group.name?.includes('(Playoffs)');

          let standings;

          if (isPlayoffGroup) {
            standings = await calculatePlayoffGroupStandings(group, matches, assignments);
          } else {
            standings = calculateGroupStandings(group, assignments, matches);
          }

          return {
            group,
            standings,
            // ✅ En playoffs siempre avanzan 2, en grupos usa la config
            advancingCount: isPlayoffGroup ? 2 : advancingCount
          };
        })
      );

      setCalculatedData(data);
    };

    buildStandings();
  }, [groups, assignments, matches, advancingCount]);

  // ✅ Mientras se verifica el estado del calendario
  if (checkingCalendar) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Verificando calendario...</p>
      </div>
    );
  }

  // ✅ Si el calendario aún no se ha generado
  if (!calendarGenerated) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📅</div>
          <h2>Calendario no generado</h2>
          <p>
            La clasificación estará disponible una vez que el administrador 
            genere el calendario de partidos.
          </p>
          <div className={styles.emptyInfo}>
            <p> Los grupos se han configurado correctamente</p>
            <p>🔹 Los equipos están registrados</p>
            <p>🔹 Falta: Generar el sorteo y calendario</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Cargando clasificación...</p>
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>⚠️ Error: {error}</div>;
  }

  if (!groups?.length) {
    return <div className={styles.empty}>📋 No hay grupos configurados aún.</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {/* ✅ Mostrar TODOS los grupos incluyendo Z y W */}
        {calculatedData.map(({ group, standings, advancingCount: groupAdvancing }) => (
          <GroupStandings
            key={group.id}
            group={group}
            standings={standings}
            advancingCount={groupAdvancing}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// FUNCIÓN PARA CALCULAR STANDINGS DE PLAYOFFS (CORREGIDA - NOMBRES REALES)
// Ya no depende de group_assignments (que no existen para Z/W)
// Obtiene los nombres directamente de la tabla profiles
// ============================================================================
async function calculatePlayoffGroupStandings(group, allMatches, allAssignments = []) {
  if (!group?.id) return [];

  // Filtrar partidos finalizados de este grupo de playoff
  const groupMatches = allMatches.filter(m => {
    const isCorrectGroup = m?.group_id === group.id;
    const isPlayoffPhase = m?.phase === 'playoff_group';
    const status = String(m?.status || '').toLowerCase();
    const isFinished = status === 'finished' || status === 'completed';
    return isCorrectGroup && isPlayoffPhase && isFinished;
  });

  // ✅ EXTRAER TODOS los equipos que participan en este grupo
  // (incluso si no hay partidos finalizados aún, para mostrar la tabla vacía)
  const allGroupMatches = allMatches.filter(m => {
    const isCorrectGroup = m?.group_id === group.id;
    const isPlayoffPhase = m?.phase === 'playoff_group';
    return isCorrectGroup && isPlayoffPhase;
  });

  const teamIds = [...new Set(
    allGroupMatches.flatMap(m => [m.home_team_id, m.away_team_id].filter(Boolean))
  )];

  if (teamIds.length === 0) return [];

  // ✅ SOLUCIÓN CLAVE: Consultar profiles directamente para obtener nombres reales
  let teamsMap = {};
  
  try {
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, team_name, badge_url')
      .in('id', teamIds);

    if (profilesError) {
      console.warn('⚠️ Error cargando profiles para playoff:', profilesError);
    }

    if (profilesData) {
      profilesData.forEach(profile => {
        teamsMap[profile.id] = {
          name: profile.team_name || 'Equipo',
          badge: profile.badge_url || null
        };
      });
    }
  } catch (e) {
    console.warn('⚠️ Error en consulta de profiles:', e);
  }

  console.log(`📊 Grupo ${group.name}: ${teamIds.length} equipos, ${Object.keys(teamsMap).length} con datos`);

  // Inicializar objetos de equipo con datos reales
  const teams = {};
  teamIds.forEach(teamId => {
    const teamData = teamsMap[teamId];
    
    teams[teamId] = {
      id: teamId,
      name: teamData?.name || 'Equipo',
      badge: teamData?.badge || null,
      pj: 0, g: 0, p: 0, pts: 0,
      sf: 0, sc: 0,
      pf: 0, pa: 0,
      h2h: {}
    };
  });

  // Si no hay partidos finalizados, retornar la tabla vacía con los equipos
  if (groupMatches.length === 0) {
    return Object.values(teams);
  }

  // Procesar cada partido finalizado
  groupMatches.forEach(match => {
    const homeId = match.home_team_id;
    const awayId = match.away_team_id;
    
    if (!homeId || !awayId || !teams[homeId] || !teams[awayId]) return;

    let homeSets = 0, awaySets = 0, homePoints = 0, awayPoints = 0;

    if (match.sets_details) {
      try {
        const sets = typeof match.sets_details === 'string' 
          ? JSON.parse(match.sets_details) 
          : match.sets_details;
        
        if (Array.isArray(sets)) {
          sets.forEach(set => {
            const h = Array.isArray(set) ? set[0] : set?.home || 0;
            const a = Array.isArray(set) ? set[1] : set?.away || 0;
            homePoints += Number(h) || 0;
            awayPoints += Number(a) || 0;
            if ((Number(h) || 0) > (Number(a) || 0)) homeSets++;
            else if ((Number(a) || 0) > (Number(h) || 0)) awaySets++;
          });
        }
      } catch (e) {
        console.warn('Error parseando sets_details:', e);
      }
    }

    if (homeSets === 0 && awaySets === 0) {
      homeSets = Number(match.home_score) || 0;
      awaySets = Number(match.away_score) || 0;
      homePoints = homeSets;
      awayPoints = awaySets;
    }

    const home = teams[homeId];
    const away = teams[awayId];

    home.pj += 1;
    away.pj += 1;
    home.sf += homeSets; home.sc += awaySets;
    away.sf += awaySets; away.sc += homeSets;
    home.pf += homePoints; home.pa += awayPoints;
    away.pf += awayPoints; away.pa += homePoints;

    if (homeSets > awaySets) {
      home.g += 1; home.pts += 2; away.p += 1; away.pts += 1;
    } else if (awaySets > homeSets) {
      away.g += 1; away.pts += 2; home.p += 1; home.pts += 1;
    } else {
      home.pts += 1; away.pts += 1;
    }
  });

  // Ordenar y retornar standings
  return Object.values(teams).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.g !== a.g) return b.g - a.g;
    const diffA = a.sf - a.sc;
    const diffB = b.sf - b.sc;
    if (diffB !== diffA) return diffB - diffA;
    return b.pf - a.pf;
  });
}