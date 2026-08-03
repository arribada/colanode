import { BoardElementStyle } from '@colanode/core';

export type BoardTool =
  | 'select'
  | 'hand'
  | 'sticky'
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'text'
  | 'connector'
  | 'pen'
  | 'frame'
  | 'mindmap';

// Connector line shape, mirrored from the core `boardConnectorSchema.routing`
// enum. Drives the toolbar's 3-way routing toggle.
export type ConnectorRouting = 'straight' | 'elbow' | 'curved';

export interface BoardStyleState {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle: NonNullable<BoardElementStyle['strokeStyle']>;
  stickyColor: string;
  opacity: number;
}

export const DEFAULT_BOARD_STYLE: BoardStyleState = {
  fill: '#ffffff',
  stroke: '#334155',
  strokeWidth: 2,
  strokeStyle: 'solid',
  stickyColor: '#fff7ae',
  opacity: 1,
};
