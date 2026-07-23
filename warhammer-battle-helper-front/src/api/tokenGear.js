import { getApiUrl, getApiHeaders } from './axios';

// Per-token character token-gear endpoints (GM-only), keyed by the scene placement's _id. Slots use
// a per-ring-position overlay (value/visibility/structure/reset); bars are an append list
// (visibility/value/add/edit/remove). All fire-and-forget — the SCENE_CHARACTER_TOKEN_UPDATED WS
// broadcast reconciles state. See backend SceneHandler token-gear handlers.

const base = (gameId, sceneId, placementId) =>
  `${getApiUrl()}/games/${gameId}/scenes/${sceneId}/tokens/${placementId}/tokenGear`;

const send = (url, method, body, token) =>
  fetch(url, {
    method,
    headers: getApiHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// saveGear replaces the whole per-token gear in one PUT (config panel's Save). Broadcasts a
// game-wide refresh so every viewer — including card-less players — re-masks. Returns the response
// so the caller can await it.
export const saveGear = (g, s, p, gear, token) =>
  send(`${base(g, s, p)}`, 'PUT', gear, token);

export const setSlotVisibility = (g, s, p, slotId, hidden, token) =>
  send(`${base(g, s, p)}/slots/${slotId}/visibility`, 'PATCH', { hidden }, token).catch(() => {});

export const setSlotValue = (g, s, p, slotId, value, token) =>
  send(`${base(g, s, p)}/slots/${slotId}/value`, 'PATCH', value, token).catch(() => {});

// slot = a TokenSlot object to override the blueprint at this position, or null to clear the override.
export const setSlotStructure = (g, s, p, slotId, slot, token) =>
  send(`${base(g, s, p)}/slots/${slotId}/structure`, 'PUT', slot, token).catch(() => {});

export const clearSlotOverride = (g, s, p, slotId, token) =>
  send(`${base(g, s, p)}/slots/${slotId}`, 'DELETE', undefined, token).catch(() => {});

export const setBarVisibility = (g, s, p, barId, hidden, token) =>
  send(`${base(g, s, p)}/bars/${barId}/visibility`, 'PATCH', { hidden }, token).catch(() => {});

export const setBarValue = (g, s, p, barId, patch, token) =>
  send(`${base(g, s, p)}/bars/${barId}/value`, 'PATCH', patch, token).catch(() => {});

export const addBar = (g, s, p, bar, token) =>
  send(`${base(g, s, p)}/bars`, 'POST', bar, token).catch(() => {});

export const editBar = (g, s, p, barId, bar, token) =>
  send(`${base(g, s, p)}/bars/${barId}/structure`, 'PATCH', bar, token).catch(() => {});

export const removeBar = (g, s, p, barId, token) =>
  send(`${base(g, s, p)}/bars/${barId}`, 'DELETE', undefined, token).catch(() => {});
