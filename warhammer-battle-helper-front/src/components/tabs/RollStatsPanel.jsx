import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import RefreshIcon from '@mui/icons-material/Refresh';
import CasinoIcon from '@mui/icons-material/Casino';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { DieTabStrip, DieStatsBlock } from '../stats/DiceStats';

const RollStatsPanel = ({ gameId, token }) => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeType, setActiveType] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/games/${gameId}/roll-stats`, {
        headers: getApiHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
      });
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      const dice = json.dice || [];
      setData(dice);
      setActiveType(dice[0]?.dieType ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [gameId, token]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return <div className="roll-stats-panel__loading">{t('common.loading')}</div>;
  }

  if (error) {
    return (
      <div className="roll-stats-panel__error">
        <span>{t('common.error')}</span>
        <button className="roll-stats-panel__refresh-btn" onClick={fetchStats}>
          <RefreshIcon fontSize="inherit" />
          {t('stats.refresh')}
        </button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="roll-stats-panel__empty">
        <CasinoIcon fontSize="small" />
        <span>{t('stats.noRollsYet')}</span>
      </div>
    );
  }

  const activeDie = data.find(d => d.dieType === activeType) ?? data[0];

  return (
    <div className="roll-stats-panel">
      <DieTabStrip dice={data} activeType={activeType} onSelect={setActiveType} />
      <DieStatsBlock stats={activeDie} variant="compact" t={t} />
      <button
        className="roll-stats-panel__refresh-btn roll-stats-panel__refresh-btn--subtle"
        onClick={fetchStats}
      >
        <RefreshIcon fontSize="inherit" />
        {t('stats.refresh')}
      </button>
    </div>
  );
};

export default RollStatsPanel;
