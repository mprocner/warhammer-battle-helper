import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import RefreshIcon from '@mui/icons-material/Refresh';
import CasinoIcon from '@mui/icons-material/Casino';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { DieTabStrip, DieStatsBlock } from '../stats/DiceStats';
import OnlineTimeStats from '../stats/OnlineTimeStats';

const RollStatsPanel = ({ gameId, token }) => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeType, setActiveType] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const fetchOnlineStats = useCallback(async () => {
    const res = await fetch(`${getApiUrl()}/games/${gameId}/online-stats`, {
      headers: getApiHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
    });
    if (!res.ok) throw new Error('fetch failed');
    return res.json();
  }, [gameId, token]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => {
    fetchStats();
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="roll-stats-panel">
      <OnlineTimeStats key={refreshKey} fetchFn={fetchOnlineStats} cssPrefix="roll-stats-panel" />

      {loading && (
        <div className="roll-stats-panel__loading">{t('common.loading')}</div>
      )}

      {!loading && error && (
        <div className="roll-stats-panel__error">
          <span>{t('common.error')}</span>
          <button className="roll-stats-panel__refresh-btn" onClick={handleRefresh}>
            <RefreshIcon fontSize="inherit" />
            {t('stats.refresh')}
          </button>
        </div>
      )}

      {!loading && !error && (!data || data.length === 0) && (
        <div className="roll-stats-panel__empty">
          <CasinoIcon fontSize="small" />
          <span>{t('stats.noRollsYet')}</span>
        </div>
      )}

      {!loading && !error && data && data.length > 0 && (
        <>
          <DieTabStrip dice={data} activeType={activeType} onSelect={setActiveType} />
          <DieStatsBlock stats={data.find(d => d.dieType === activeType) ?? data[0]} variant="compact" t={t} />
        </>
      )}

      <button
        className="roll-stats-panel__refresh-btn roll-stats-panel__refresh-btn--subtle"
        onClick={handleRefresh}
      >
        <RefreshIcon fontSize="inherit" />
        {t('stats.refresh')}
      </button>
    </div>
  );
};

export default RollStatsPanel;
