import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';
import { isTemplateLanguage } from '../utils/templateLanguages';

// useTemplates owns the custom-system templates visible to the user: those they are a member of
// plus every public one (each carrying myRole/permissions from the server). Token-config templates are filtered out
// server-side — they describe a hardcoded system's token overlay, not a playable system.
//
// Template failures are non-critical: the lobby stays usable without the list, so errors
// here never surface as a page-level alert.
export function useTemplates(token) {
  const { t, i18n } = useTranslation();
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
    // A new template starts in the UI language: right for most authors, and it keeps the
    // language filter useful without asking for one more field up front.
    const language = isTemplateLanguage(i18n.language) ? i18n.language : '';
    try {
      const response = await fetch(`${getApiUrl()}/templates`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, sections: [], language }),
      });
      if (!response.ok) throw new Error('Failed to create template');
      const created = await response.json();
      setTemplates(prev => [created, ...prev]);
      return created;
    } catch {
      return null;
    }
  }, [authHeaders, i18n]);

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

  // Leaving answers ok only once the server removed the membership; a refused leave (last owner)
  // keeps the row, so the list never shows a state the server does not have.
  const leaveTemplate = useCallback(async (templateId) => {
    try {
      const res = await fetch(`${getApiUrl()}/templates/${templateId}/membership`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) return false;
      setTemplates(prev => prev.filter(tpl => tpl.id !== templateId));
      return true;
    } catch {
      return false;
    }
  }, [authHeaders]);

  // Swaps in a template edited elsewhere (the builder) without a refetch.
  const replaceTemplate = useCallback((updated) => {
    if (!updated?.id) return;
    setTemplates(prev => prev.map(tpl => (tpl.id === updated.id ? updated : tpl)));
  }, []);

  return { templates, fetchTemplates, createTemplate, deleteTemplate, cloneTemplate, leaveTemplate, replaceTemplate };
}

export default useTemplates;
