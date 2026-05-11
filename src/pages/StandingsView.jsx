// src/pages/StandingsView.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useStandings } from '../features/standings/hooks/useStandings';
import { calculateGroupStandings } from '../features/standings/utils/calculateStandings';
import GroupStandings from '../features/standings/components/GroupStandings';
import styles from './StandingsView.module.css';

// 🔥 FUNCIÓN UTILIDAD PARA DETECTAR GRUPOS A OCULTAR
const shouldHideGroup = (groupName) => {
  if (!groupName) return false;
  const name = groupName.trim().toUpperCase();
  
  // Ocultar si es exactamente Z o W
  if (['Z', 'W'].includes(name)) return true;
  
  // Ocultar si termina en " Z" o " W" (ej: "Grupo Z", "Fase W", "Playoffs Z")
  if (/\s[Z|W]$/.test(name)) return true;
  
  // Ocultar si contiene " Z " o " W " en medio (ej: "Grupo Z Final")
  if (/\s[Z|W]\s/.test(name)) return true;
  
  return false;
};

export default function StandingsView() {
  const { groups, assignments, matches, loading, error } = useStandings();
  const [advancingCount, setAdvancingCount] = useState(2);
  const [calculatedData, setCalculatedData] = useState([]);

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
            advancingCount
          };
        })
      );

      setCalculatedData(data);
    };

    buildStandings();
  }, [groups, assignments, matches, advancingCount]);

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
        {calculatedData
          // 🔥 FILTRO VISUAL FINAL: Ocultar grupos Z y W al 100%
          .filter(({ group }) => !shouldHideGroup(group.name))
          .map(({ group, standings }) => (
            <GroupStandings
              key={group.id}
              group={group}
              standings={standings}
              advancingCount={advancingCount}
            />
          ))}
      </div>
    </div>
  );
}

// ============================================================================
// FUNCIÓN PARA CALCULAR STANDINGS DE PLAYOFFS (CORREGIDA - NOMBRES REALES)
// ============================================================================
async function calculatePlayoffGroupStandings(group, allMatches, allAssignments = []) {
  if (!group?.id) return [];

  const groupMatches = allMatches.filter(m => {
    const isCorrectGroup = m?.group_id === group.id;
    const isPlayoffPhase = m?.phase === 'playoff_group';
    const status = String(m?.status || '').toLowerCase();
    const isFinished = status === 'finished' || status === 'completed';
    return isCorrectGroup && isPlayoffPhase && isFinished;
  });

  if (groupMatches.length === 0) return [];

  // Extraer equipos únicos de los partidos
  const teamIds = [...new Set(
    groupMatches.flatMap(m => [m.home_team_id, m.away_team_id].filter(Boolean))
  )];

  if (teamIds.length === 0) return [];

  // ✅ SOLUCIÓN: Crear mapa de equipos con nombres reales
  const teamsMap = {};
  
  // 1. Primero, intentar obtener datos de assignments (ya tiene join con profiles)
  allAssignments.forEach(assignment => {
    if (assignment.team_id && assignment.profiles) {
      teamsMap[assignment.team_id] = {
        name: assignment.profiles.team_name || 'Equipo',
        badge: assignment.profiles.badge_url || null
      };
    }
  });

  // 2. Si no hay datos en assignments, consultar profiles directamente
  if (Object.keys(teamsMap).length === 0 && teamIds.length > 0) {
    try {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, team_name, badge_url')
        .in('id', teamIds);

      profilesData?.forEach(profile => {
        teamsMap[profile.id] = {
          name: profile.team_name || 'Equipo',
          badge: profile.badge_url || null
        };
      });
    } catch (e) {
      console.warn('⚠️ Error cargando profiles:', e);
    }
  }

  // 3. Si aún no hay datos, intentar consultar tabla teams (si existe)
  if (Object.keys(teamsMap).length === 0 && teamIds.length > 0) {
    try {
      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, team_name, badge_url')
        .in('id', teamIds);

      teamsData?.forEach(team => {
        teamsMap[team.id] = {
          name: team.team_name || 'Equipo',
          badge: team.badge_url || null
        };
      });
    } catch (e) {
      console.warn('⚠️ Error cargando teams:', e);
    }
  }

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

  // Procesar cada partido
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