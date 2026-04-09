import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import RefreshIcon from '@mui/icons-material/Refresh';
import axiosInstance from '../../api/axios';
import { DieTabStrip, DieStatsBlock } from '../stats/DiceStats';

const RollStatisticsSettings = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeType, setActiveType] = useState(null);

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

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return <div className="roll-stats-settings__loading">{t('common.loading')}</div>;
  }

  if (error) {
    return (
      <div className="roll-stats-settings__error">
        <span>{t('common.error')}</span>
        <button className="roll-stats-settings__refresh-btn" onClick={fetchStats}>
          <RefreshIcon fontSize="inherit" /> {t('stats.refresh')}
        </button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="roll-stats-settings__empty">
        <CasinoIcon />
        <p>{t('stats.noLifetimeRolls')}</p>
      </div>
    );
  }

  const activeDie = data.find(d => d.dieType === activeType) ?? data[0];

  return (
    <div className="roll-stats-settings">
      <DieTabStrip dice={data} activeType={activeType} onSelect={setActiveType} />
      <DieStatsBlock stats={activeDie} variant="expanded" t={t} />
    </div>
  );
};

export default RollStatisticsSettings;
