import { createContext, useContext } from 'react';

const ZoomContext = createContext({
  zoom: 1,
  gridWidth: 20,
  gridHeight: 20,
});

export const useZoom = () => useContext(ZoomContext);

export default ZoomContext;
