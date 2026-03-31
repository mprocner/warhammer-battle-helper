export const half = (v) => Math.floor(v / 2);
export const fifth = (v) => Math.floor(v / 5);
export const numAttr = (stats, key) => stats?.attributes?.[key] ?? stats?.[key] ?? 0;
export const skillVal = (edited, skill) => {
  if (skill.key?.startsWith('custom_')) {
    const cs = (edited.customSkills || []).find(c => c.key === skill.key);
    return cs !== undefined ? (cs.value ?? cs.base ?? 0) : (skill.base ?? 0);
  }
  const stored = (edited.skills || {})[skill.key];
  return stored !== undefined ? stored : (skill.base ?? 0);
};
