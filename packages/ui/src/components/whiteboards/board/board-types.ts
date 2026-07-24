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

export interface BoardStyleState {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle: NonNullable<BoardElementStyle['strokeStyle']>;
  stickyColor: string;
}

export const DEFAULT_BOARD_STYLE: BoardStyleState = {
  fill: '#ffffff',
  stroke: '#334155',
  strokeWidth: 2,
  strokeStyle: 'solid',
  stickyColor: '#fff7ae',
};
