import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import RefreshIcon from '@mui/icons-material/Refresh';
import axiosInstance from '../../api/axios';
import { DieTabStrip, DieStatsBlock } from '../stats/DiceStats';
import OnlineTimeStats from '../stats/OnlineTimeStats';

const RollStatisticsSettings = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeType, setActiveType] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await axiosInstance.get('/profile/roll-stats');
      const dice = res.data.allTime || [];
      setData(dice);
      setActiveType(dice[0]?.dieType ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOnlineStats = useCallback(async () => {
    const res = await axiosInstance.get('/profile/online-stats');
    return res.data;
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => {
    fetchStats();
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="roll-stats-settings">
      <OnlineTimeStats key={refreshKey} fetchFn={fetchOnlineStats} cssPrefix="roll-stats-settings" />

      {loading && (
        <div className="roll-stats-settings__loading">{t('common.loading')}</div>
      )}

      {!loading && error && (
        <div className="roll-stats-settings__error">
          <span>{t('common.error')}</span>
          <button className="roll-stats-settings__refresh-btn" onClick={handleRefresh}>
            <RefreshIcon fontSize="inherit" /> {t('stats.refresh')}
          </button>
        </div>
      )}

      {!loading && !error && (!data || data.length === 0) && (
        <div className="roll-stats-settings__empty">
          <CasinoIcon />
          <p>{t('stats.noLifetimeRolls')}</p>
        </div>
      )}

      {!loading && !error && data && data.length > 0 && (
        <>
          <DieTabStrip dice={data} activeType={activeType} onSelect={setActiveType} />
          <DieStatsBlock stats={data.find(d => d.dieType === activeType) ?? data[0]} variant="expanded" t={t} />
        </>
      )}

      <button
        className="roll-stats-settings__refresh-btn roll-stats-settings__refresh-btn--subtle"
        onClick={handleRefresh}
      >
        <RefreshIcon fontSize="inherit" />
        {t('stats.refresh')}
      </button>
    </div>
  );
};

export default RollStatisticsSettings;
