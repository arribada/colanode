// Board templates. Each builds a fresh BoardScene (record keyed by element id)
// with valid fractional z ordering. Shipped: Blank, Brainstorm, Mind map,
// Retro, Flowchart, SWOT.

import { BoardElement, BoardScene } from '@colanode/core';
import {
  createElement,
  CreateElementInput,
  STICKY_COLORS,
} from '@colanode/ui/lib/board/elements';
import { generateNKeysBetween } from '@colanode/ui/lib/board/fractional-index';
import { layoutTidyTree, TidyNode } from '@colanode/ui/lib/board/tidy-tree';

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  build: () => BoardScene;
}

// Builds a scene from a list of element specs, auto-assigning ordered z keys.
const buildScene = (
  specs: Array<Omit<CreateElementInput, 'z'> & { connector?: BoardElement['connector'] }>
): BoardScene => {
  const keys = generateNKeysBetween(null, null, specs.length);
  const scene: BoardScene = {};
  specs.forEach((spec, i) => {
    const { connector, ...rest } = spec;
    const el = createElement({ ...rest, z: keys[i]! });
    if (connector) {
      el.connector = connector;
    }
    scene[el.id] = el;
  });
  return scene;
};

const blank: BoardTemplate = {
  id: 'blank',
  name: 'Blank',
  description: 'An empty canvas.',
  build: () => ({}),
};

const brainstorm: BoardTemplate = {
  id: 'brainstorm',
  name: 'Brainstorm',
  description: 'A sticky-note grid with idea zones.',
  build: () => {
    const specs: Array<Omit<CreateElementInput, 'z'>> = [];
    specs.push({
      type: 'text',
      x: 80,
      y: 40,
      w: 400,
      h: 48,
      text: 'Brainstorm',
      style: { fontSize: 32, fontWeight: 'bold' },
    });
    const zones = ['Ideas', 'Questions', 'Next steps'];
    zones.forEach((label, zi) => {
      const zoneX = 80 + zi * 320;
      specs.push({
        type: 'frame',
        x: zoneX,
        y: 110,
        w: 280,
        h: 460,
        text: label,
      });
      for (let r = 0; r < 3; r++) {
        specs.push({
          type: 'sticky',
          x: zoneX + 20,
          y: 160 + r * 150,
          w: 240,
          h: 130,
          style: { fill: STICKY_COLORS[(zi + r) % STICKY_COLORS.length] },
          text: '',
        });
      }
    });
    return buildScene(specs);
  },
};

const retro: BoardTemplate = {
  id: 'retro',
  name: 'Retro',
  description: 'Start / Stop / Continue columns.',
  build: () => {
    const cols = [
      { label: 'Start', fill: '#d5f5e3' },
      { label: 'Stop', fill: '#fee2e2' },
      { label: 'Continue', fill: '#dbeafe' },
    ];
    const specs: Array<Omit<CreateElementInput, 'z'>> = [
      {
        type: 'text',
        x: 80,
        y: 40,
        w: 500,
        h: 48,
        text: 'Sprint Retro',
        style: { fontSize: 32, fontWeight: 'bold' },
      },
    ];
    cols.forEach((col, i) => {
      const x = 80 + i * 340;
      specs.push({
        type: 'frame',
        x,
        y: 110,
        w: 300,
        h: 520,
        text: col.label,
      });
      specs.push({
        type: 'sticky',
        x: x + 24,
        y: 170,
        w: 252,
        h: 120,
        style: { fill: col.fill },
        text: '',
      });
    });
    return buildScene(specs);
  },
};

const swot: BoardTemplate = {
  id: 'swot',
  name: 'SWOT',
  description: 'Strengths / Weaknesses / Opportunities / Threats.',
  build: () => {
    const quadrants = [
      { label: 'Strengths', fill: '#dcfce7', dx: 0, dy: 0 },
      { label: 'Weaknesses', fill: '#fee2e2', dx: 1, dy: 0 },
      { label: 'Opportunities', fill: '#dbeafe', dx: 0, dy: 1 },
      { label: 'Threats', fill: '#fef9c3', dx: 1, dy: 1 },
    ];
    const specs: Array<Omit<CreateElementInput, 'z'>> = [];
    quadrants.forEach((q) => {
      const x = 80 + q.dx * 380;
      const y = 80 + q.dy * 320;
      specs.push({
        type: 'rect',
        x,
        y,
        w: 360,
        h: 300,
        style: { fill: q.fill, stroke: '#64748b', strokeWidth: 2 },
        text: q.label,
      });
    });
    return buildScene(specs);
  },
};

const flowchart: BoardTemplate = {
  id: 'flowchart',
  name: 'Flowchart',
  description: 'Start → Process → Decision → End with connectors.',
  build: () => {
    const keys = generateNKeysBetween(null, null, 7);
    const scene: BoardScene = {};
    const start = createElement({
      type: 'ellipse',
      x: 200,
      y: 60,
      w: 160,
      h: 80,
      z: keys[0]!,
      text: 'Start',
    });
    const process = createElement({
      type: 'rect',
      x: 200,
      y: 200,
      w: 160,
      h: 90,
      z: keys[1]!,
      text: 'Process',
    });
    const decision = createElement({
      type: 'diamond',
      x: 190,
      y: 350,
      w: 180,
      h: 120,
      z: keys[2]!,
      text: 'Decision?',
    });
    const yes = createElement({
      type: 'rect',
      x: 200,
      y: 540,
      w: 160,
      h: 90,
      z: keys[3]!,
      text: 'Yes path',
    });
    const end = createElement({
      type: 'ellipse',
      x: 460,
      y: 370,
      w: 160,
      h: 80,
      z: keys[4]!,
      text: 'End',
    });
    for (const el of [start, process, decision, yes, end]) {
      scene[el.id] = el;
    }
    const link = (from: BoardElement, to: BoardElement, z: string) => {
      const c = createElement({ type: 'connector', x: 0, y: 0, z });
      c.connector = { fromId: from.id, toId: to.id, arrowEnd: true };
      scene[c.id] = c;
    };
    link(start, process, keys[5]!);
    link(process, decision, keys[6]!);
    const extra = generateNKeysBetween(keys[6]!, null, 2);
    link(decision, yes, extra[0]!);
    link(decision, end, extra[1]!);
    return scene;
  },
};

const mindmapTemplate: BoardTemplate = {
  id: 'mindmap',
  name: 'Mind map',
  description: 'A central topic with branches.',
  build: () => {
    const tree: TidyNode = {
      id: 'root',
      children: [
        {
          id: 'b1',
          children: [
            { id: 'b1a', children: [] },
            { id: 'b1b', children: [] },
          ],
        },
        {
          id: 'b2',
          children: [{ id: 'b2a', children: [] }],
        },
        { id: 'b3', children: [] },
      ],
    };
    const labels: Record<string, string> = {
      root: 'Central topic',
      b1: 'Branch 1',
      b1a: 'Idea',
      b1b: 'Idea',
      b2: 'Branch 2',
      b2a: 'Idea',
      b3: 'Branch 3',
    };
    const parents: Record<string, string | undefined> = {
      root: undefined,
      b1: 'root',
      b1a: 'b1',
      b1b: 'b1',
      b2: 'root',
      b2a: 'b2',
      b3: 'root',
    };
    const pos = layoutTidyTree(tree, {
      nodeW: 170,
      nodeH: 52,
      hGap: 80,
      vGap: 24,
      startX: 120,
      startY: 120,
    });
    const treeIds = Object.keys(pos);
    const keys = generateNKeysBetween(null, null, treeIds.length);
    const scene: BoardScene = {};
    // stable map from tree id -> generated element id
    const idMap: Record<string, string> = {};
    treeIds.forEach((tid, i) => {
      const p = pos[tid]!;
      const el = createElement({
        type: 'mindmap',
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        z: keys[i]!,
        text: labels[tid] ?? 'Idea',
      });
      idMap[tid] = el.id;
      scene[el.id] = el;
    });
    // wire mindmap parent links now that element ids exist
    treeIds.forEach((tid) => {
      const parent = parents[tid];
      const el = scene[idMap[tid]!]!;
      el.mindmap = { parentId: parent ? idMap[parent] : undefined };
    });
    return scene;
  },
};

const kanban: BoardTemplate = {
  id: 'kanban',
  name: 'Kanban',
  description: 'Backlog / To do / In progress / Done.',
  build: () => {
    const cols = [
      { label: 'Backlog', fill: '#e2e8f0' },
      { label: 'To do', fill: '#dbeafe' },
      { label: 'In progress', fill: '#fef9c3' },
      { label: 'Done', fill: '#dcfce7' },
    ];
    const specs: Array<Omit<CreateElementInput, 'z'>> = [
      {
        type: 'text',
        x: 80,
        y: 40,
        w: 600,
        h: 48,
        text: 'Kanban board',
        style: { fontSize: 32, fontWeight: 'bold' },
      },
    ];
    cols.forEach((col, i) => {
      const x = 80 + i * 280;
      specs.push({ type: 'frame', x, y: 110, w: 250, h: 560, text: col.label });
      for (let r = 0; r < 2; r++) {
        specs.push({
          type: 'sticky',
          x: x + 18,
          y: 160 + r * 140,
          w: 214,
          h: 120,
          style: { fill: col.fill },
          text: '',
        });
      }
    });
    return buildScene(specs);
  },
};

const timeline: BoardTemplate = {
  id: 'timeline',
  name: 'Timeline',
  description: 'A horizontal roadmap with milestones.',
  build: () => {
    const specs: Array<
      Omit<CreateElementInput, 'z'> & { connector?: BoardElement['connector'] }
    > = [
      {
        type: 'text',
        x: 80,
        y: 40,
        w: 500,
        h: 48,
        text: 'Timeline',
        style: { fontSize: 32, fontWeight: 'bold' },
      },
    ];
    const milestones = ['Kickoff', 'Design', 'Build', 'Launch', 'Review'];
    const y = 260;
    const startX = 120;
    const gap = 260;
    specs.push({
      type: 'connector',
      x: 0,
      y: 0,
      points: [
        [startX, y + 60],
        [startX + gap * (milestones.length - 1), y + 60],
      ],
      style: { stroke: '#94a3b8', strokeWidth: 3 },
      connector: { arrowEnd: true },
    });
    milestones.forEach((label, i) => {
      const x = startX + i * gap;
      specs.push({
        type: 'ellipse',
        x: x - 8,
        y: y + 52,
        w: 16,
        h: 16,
        style: { fill: '#6366f1', stroke: '#4f46e5', strokeWidth: 2 },
      });
      const cardY = i % 2 === 0 ? y - 40 : y + 110;
      specs.push({
        type: 'rect',
        x: x - 90,
        y: cardY,
        w: 180,
        h: 70,
        text: label,
        style: { fill: '#eef2ff', stroke: '#6366f1', strokeWidth: 2 },
      });
    });
    return buildScene(specs);
  },
};

const orgchart: BoardTemplate = {
  id: 'orgchart',
  name: 'Org chart',
  description: 'A top-down hierarchy with connectors.',
  build: () => {
    const nodes = [
      { id: 'ceo', label: 'CEO', x: 400, y: 60 },
      { id: 'a', label: 'Lead A', x: 200, y: 220 },
      { id: 'b', label: 'Lead B', x: 400, y: 220 },
      { id: 'c', label: 'Lead C', x: 600, y: 220 },
      { id: 'a1', label: 'Member', x: 120, y: 380 },
      { id: 'a2', label: 'Member', x: 300, y: 380 },
      { id: 'c1', label: 'Member', x: 600, y: 380 },
    ];
    const edges: Array<[string, string]> = [
      ['ceo', 'a'],
      ['ceo', 'b'],
      ['ceo', 'c'],
      ['a', 'a1'],
      ['a', 'a2'],
      ['c', 'c1'],
    ];
    const keys = generateNKeysBetween(null, null, nodes.length + edges.length);
    const scene: BoardScene = {};
    const idMap: Record<string, string> = {};
    nodes.forEach((n, i) => {
      const el = createElement({
        type: 'rect',
        x: n.x - 80,
        y: n.y,
        w: 160,
        h: 70,
        z: keys[i]!,
        text: n.label,
        style: { fill: '#ffffff', stroke: '#334155', strokeWidth: 2 },
      });
      idMap[n.id] = el.id;
      scene[el.id] = el;
    });
    edges.forEach(([from, to], i) => {
      const c = createElement({
        type: 'connector',
        x: 0,
        y: 0,
        z: keys[nodes.length + i]!,
      });
      c.connector = {
        fromId: idMap[from]!,
        toId: idMap[to]!,
        arrowEnd: true,
        fromAnchor: 'bottom',
        toAnchor: 'top',
      };
      scene[c.id] = c;
    });
    return scene;
  },
};

export const BOARD_TEMPLATES: BoardTemplate[] = [
  blank,
  brainstorm,
  mindmapTemplate,
  orgchart,
  flowchart,
  kanban,
  timeline,
  retro,
  swot,
];

export const getTemplate = (id: string): BoardTemplate | undefined =>
  BOARD_TEMPLATES.find((t) => t.id === id);
