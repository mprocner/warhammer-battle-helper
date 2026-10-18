// Stand-in for a Tiptap editor in toolbar tests. Records every command of
// editor.chain()...run() as [name, ...args], so a test asserts on what would reach Tiptap
// without a ProseMirror instance (which CRA's Jest cannot load anyway).
export const createFakeEditor = ({ active = [], attributes = {}, selectionEmpty = false } = {}) => {
  const calls = [];
  const chain = () => {
    const proxy = new Proxy({}, {
      get: (_, name) => (name === 'run'
        ? () => true
        : (...args) => {
          calls.push([name, ...args]);
          return proxy;
        }),
    });
    return proxy;
  };
  const isActive = (nameOrAttrs, attrs) => {
    const key = typeof nameOrAttrs === 'object'
      ? Object.entries(nameOrAttrs).map(([k, v]) => `${k}:${v}`).join(',')
      : (attrs?.level ? `${nameOrAttrs}:${attrs.level}` : nameOrAttrs);
    return active.includes(key);
  };
  return {
    calls,
    commandNames: () => calls.map(([name]) => name),
    chain,
    isActive,
    getAttributes: (name) => attributes[name] ?? {},
    state: { selection: { empty: selectionEmpty } },
  };
};
