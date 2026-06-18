// src/lib/tournament/draftStorage.js
// Gestión de partidos fantasma (draft) en localStorage

const DRAFT_KEY = 'tournament_draft_matches';
const DRAFT_GROUPS_KEY = 'tournament_draft_groups';
const DRAFT_CONFIRMED_KEY = 'tournament_draft_confirmed';

/**
 * Guarda los partidos fantasma en localStorage
 */
export const saveDraftMatches = (matches, groups) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(matches));
    localStorage.setItem(DRAFT_GROUPS_KEY, JSON.stringify(groups));
    localStorage.setItem(DRAFT_CONFIRMED_KEY, 'false');
    return true;
  } catch (err) {
    console.error('Error guardando draft:', err);
    return false;
  }
};

/**
 * Carga los partidos fantasma desde localStorage
 */
export const loadDraftMatches = () => {
  try {
    const matches = localStorage.getItem(DRAFT_KEY);
    const groups = localStorage.getItem(DRAFT_GROUPS_KEY);
    
    if (!matches) return null;
    
    return {
      matches: JSON.parse(matches),
      groups: groups ? JSON.parse(groups) : []
    };
  } catch (err) {
    console.error('Error cargando draft:', err);
    return null;
  }
};

/**
 * Actualiza un partido específico en el draft
 */
export const updateDraftMatch = (draftId, updates) => {
  try {
    const draft = loadDraftMatches();
    if (!draft) return false;
    
    const matchIndex = draft.matches.findIndex(m => m.draft_id === draftId);
    if (matchIndex === -1) return false;
    
    draft.matches[matchIndex] = { ...draft.matches[matchIndex], ...updates };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft.matches));
    return true;
  } catch (err) {
    console.error('Error actualizando draft:', err);
    return false;
  }
};

/**
 * Marca el draft como confirmado (listo para hacer oficial)
 */
export const confirmDraft = () => {
  try {
    localStorage.setItem(DRAFT_CONFIRMED_KEY, 'true');
    return true;
  } catch (err) {
    console.error('Error confirmando draft:', err);
    return false;
  }
};

/**
 * Verifica si hay un draft confirmado
 */
export const hasConfirmedDraft = () => {
  try {
    return localStorage.getItem(DRAFT_CONFIRMED_KEY) === 'true' && 
           localStorage.getItem(DRAFT_KEY) !== null;
  } catch (err) {
    return false;
  }
};

/**
 * Verifica si hay un draft (confirmado o no)
 */
export const hasDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY) !== null;
  } catch (err) {
    return false;
  }
};

/**
 * Limpia completamente el draft
 */
export const clearDraft = () => {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_GROUPS_KEY);
    localStorage.removeItem(DRAFT_CONFIRMED_KEY);
    return true;
  } catch (err) {
    console.error('Error limpiando draft:', err);
    return false;
  }
};

/**
 * Convierte partidos draft a partidos oficiales (sin draft_id)
 */
export const draftToOfficial = (draftMatches) => {
  return draftMatches.map(m => {
    const { draft_id, ...official } = m;
    return official;
  });
};