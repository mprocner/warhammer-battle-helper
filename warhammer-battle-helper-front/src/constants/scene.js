export const CELL_SIZE = 50; // pixels per grid cell in canvas space

// Off-scene staging margin: how far beyond the grid, on every side, the GM may park images.
// Players never receive an image that sits entirely out here; the overhang of one that straddles
// the edge is clipped. Mirrored server-side as OffSceneMarginCells.
export const OFFSCENE_MARGIN_CELLS = 100;

export const GRID_PADDING = 20;
export const GRID_BORDER = 6;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3.0;

export const getCanvasSize = (gridWidth, gridHeight) => ({
  width: gridWidth * CELL_SIZE,
  height: gridHeight * CELL_SIZE,
});
