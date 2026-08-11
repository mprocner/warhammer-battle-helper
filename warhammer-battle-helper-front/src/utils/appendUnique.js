/**
 * Appends an item to a list only when its id is not already there.
 *
 * Entities created by the GM reach the client twice — once as the HTTP response of the
 * POST, once as the WebSocket broadcast of the same create — and the two race. Appending
 * blindly on both paths produces two entries sharing one id, which then survives into the
 * database through a reorder and makes a delete remove both copies.
 *
 * @template {{id: string}} T
 * @param {T[]|null|undefined} list
 * @param {T|null|undefined} item
 * @returns {T[]} the original list when nothing was added, otherwise a new array
 */
export const appendUnique = (list, item) => {
  const current = list || [];
  if (!item) return current;
  if (current.some((entry) => entry.id === item.id)) return current;
  return [...current, item];
};

export default appendUnique;
