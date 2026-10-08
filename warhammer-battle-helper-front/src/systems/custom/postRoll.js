import { getApiUrl, getApiHeaders } from '../../api/axios';

// POSTs a roll to the game and reports a failure through onFail. fetch resolves (does not throw)
// on HTTP 4xx/5xx, so a rejected roll has to be detected via res.ok; the catch covers only
// network failures.
export async function postRoll(gameId, endpoint, token, body, onFail) {
  try {
    const res = await fetch(`${getApiUrl()}/games/${gameId}/${endpoint}`, {
      method: 'POST',
      headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
      body: JSON.stringify(body),
    });
    if (!res.ok) onFail();
  } catch {
    onFail();
  }
}
