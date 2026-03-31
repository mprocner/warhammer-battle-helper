export const half = (v) => Math.floor(v / 2);
export const fifth = (v) => Math.floor(v / 5);
export const numAttr = (edited, key) => edited[key] || 0;
export const skillVal = (edited, skill) => {
  const stored = (edited.skills || {})[skill.key];
  return stored !== undefined ? stored : skill.base;
};
