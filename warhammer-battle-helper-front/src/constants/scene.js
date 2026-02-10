export const CELL_SIZE = 50; // pixels per grid cell in canvas space
export const GRID_PADDING = 20;
export const GRID_BORDER = 6;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3.0;

export const getCanvasSize = (gridWidth, gridHeight) => ({
  width: gridWidth * CELL_SIZE + GRID_PADDING * 2 + GRID_BORDER * 2,
  height: gridHeight * CELL_SIZE + GRID_PADDING * 2 + GRID_BORDER * 2,
});
