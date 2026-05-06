// src/features/matches/components/MatchFilters.jsx
import { useState } from 'react';
import { Input, Button } from '../../../design-system/components';
import styles from './MatchFilters.module.css';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'scheduled', label: '📅 Programados' },
  { value: 'live', label: '🔴 En Vivo' },
  { value: 'finished', label: '✅ Finalizados' }
];

export default function MatchFilters({ onFilterChange, onRefresh }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const applyFilters = () => {
    onFilterChange({
      search: search.trim() || null,
      status: status || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null
    });
  };

  const clearFilters = () => {
    setSearch(''); setStatus(''); setDateFrom(''); setDateTo('');
    onFilterChange({ search: null, status: null, dateFrom: null, dateTo: null });
  };

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <Input
          placeholder="Buscar equipo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          iconLeft="🔍"
          className={styles.searchInput}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={styles.select}>
          {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
      
      <div className={styles.row}>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={styles.dateInput} />
        <span className={styles.dateSeparator}>→</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={styles.dateInput} />
        
        <div className={styles.actions}>
          <Button variant="ghost" onClick={clearFilters}>Limpiar</Button>
          <Button onClick={applyFilters}>Filtrar</Button>
          <Button variant="ghost" onClick={onRefresh} title="Actualizar">🔄</Button>
        </div>
      </div>
    </div>
  );
}