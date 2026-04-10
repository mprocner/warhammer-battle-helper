import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

const formatDuration = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

/**
 * Reusable online time stats display.
 * @param {Function} fetchFn - async function that returns { totalSeconds, sessionCount }
 * @param {string} cssPrefix - CSS class prefix (e.g. "roll-stats-panel" or "roll-stats-settings")
 */
const OnlineTimeStats = ({ fetchFn, cssPrefix = 'roll-stats-panel' }) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchFn();
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !stats) return null;

  if (stats.totalSeconds === 0 && stats.sessionCount === 0) {
    return (
      <div className={`${cssPrefix}__empty`}>
        <AccessTimeIcon fontSize="small" />
        <span>{t('stats.noSessionsYet')}</span>
      </div>
    );
  }

  return (
    <div className={`${cssPrefix}__online`}>
      <div className={`${cssPrefix}__online-header`}>
        <AccessTimeIcon fontSize="small" />
        <span>{t('stats.onlineTime')}</span>
      </div>
      <div className={`${cssPrefix}__online-stats`}>
        <div className={`${cssPrefix}__online-stat`}>
          <span className={`${cssPrefix}__online-label`}>{t('stats.totalOnlineTime')}</span>
          <span className={`${cssPrefix}__online-value`}>{formatDuration(stats.totalSeconds)}</span>
        </div>
        <div className={`${cssPrefix}__online-stat`}>
          <span className={`${cssPrefix}__online-label`}>{t('stats.sessionCount')}</span>
          <span className={`${cssPrefix}__online-value`}>{stats.sessionCount}</span>
        </div>
      </div>
    </div>
  );
};

export default OnlineTimeStats;
