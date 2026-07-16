import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';

// useTemplates owns the custom-system templates visible to the user: their own plus every
// public one (flagged isOwner by the server). Token-config templates are filtered out
// server-side — they describe a hardcoded system's token overlay, not a playable system.
//
// Template failures are non-critical: the lobby stays usable without the list, so errors
// here never surface as a page-level alert.
export function useTemplates(token) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState([]);

  const authHeaders = useCallback(
    (extra) => getApiHeaders({ Authorization: `Bearer ${token}`, ...extra }),
    [token]
  );

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/templates`, { headers: authHeaders() });
      if (!response.ok) return;
      setTemplates((await response.json()) || []);
    } catch { /* non-critical */ }
  }, [authHeaders]);

  // Returns the created template so the caller can open it in the builder right away.
  const createTemplate = useCallback(async (name) => {
    try {
      const response = await fetch(`${getApiUrl()}/templates`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, sections: [] }),
      });
      if (!response.ok) throw new Error('Failed to create template');
      const created = await response.json();
      setTemplates(prev => [created, ...prev]);
      return created;
    } catch {
      return null;
    }
  }, [authHeaders]);

  const deleteTemplate = useCallback(async (templateId) => {
    try {
      await fetch(`${getApiUrl()}/templates/${templateId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setTemplates(prev => prev.filter(tpl => tpl.id !== templateId));
    } catch { /* non-critical */ }
  }, [authHeaders]);

  const cloneTemplate = useCallback(async (template) => {
    try {
      const res = await fetch(`${getApiUrl()}/templates/${template.id}/clone`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: `${template.name} ${t('creator.copySuffix')}` }),
      });
      if (!res.ok) throw new Error('clone failed');
      const clone = await res.json();
      setTemplates(prev => [clone, ...prev]);
      return clone;
    } catch {
      return null;
    }
  }, [authHeaders, t]);

  // Swaps in a template edited elsewhere (the builder) without a refetch.
  const replaceTemplate = useCallback((updated) => {
    if (!updated?.id) return;
    setTemplates(prev => prev.map(tpl => (tpl.id === updated.id ? updated : tpl)));
  }, []);

  return { templates, fetchTemplates, createTemplate, deleteTemplate, cloneTemplate, replaceTemplate };
}

export default useTemplates;
