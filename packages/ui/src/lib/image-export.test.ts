import { describe, expect, it } from 'vitest';

import {
  mermaidExportSource,
  svgExportSize,
  withPixelSize,
} from '@colanode/ui/lib/image-export';

describe('svgExportSize', () => {
  it('uses the viewBox, times the scale', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width: 320px;" viewBox="-8 -8 320.5 150"><g/></svg>';
    expect(svgExportSize(svg, 2)).toEqual({ width: 641, height: 300 });
  });

  it('falls back to numeric width and height attributes', () => {
    expect(svgExportSize('<svg width="200px" height="80"></svg>', 1)).toEqual({
      width: 200,
      height: 80,
    });
  });

  it('does not take a percentage width for a size', () => {
    expect(svgExportSize('<svg width="100%" height="80"></svg>')).toBeNull();
  });

  it('shrinks a huge diagram to fit the export limit, keeping its shape', () => {
    expect(svgExportSize('<svg viewBox="0 0 8000 2000"></svg>', 2)).toEqual({
      width: 4096,
      height: 1024,
    });
  });

  it('returns null without an svg root or a usable size', () => {
    expect(svgExportSize('<div></div>')).toBeNull();
    expect(svgExportSize('<svg viewBox="0 0 0 10"></svg>')).toBeNull();
  });
});

describe('withPixelSize', () => {
  it('replaces the root width, height and max-width style with pixels', () => {
    const svg =
      '<svg id="m" width="100%" style="max-width: 320px;" viewBox="0 0 320 150" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    expect(withPixelSize(svg, { width: 640, height: 300 })).toBe(
      '<svg id="m" viewBox="0 0 320 150" xmlns="http://www.w3.org/2000/svg" width="640" height="300"><rect width="10" height="10"/></svg>'
    );
  });

  it('keeps a self-closing root self-closing', () => {
    expect(
      withPixelSize('<svg viewBox="0 0 1 1"/>', { width: 2, height: 2 })
    ).toBe('<svg viewBox="0 0 1 1" width="2" height="2"/>');
  });
});

describe('mermaidExportSource', () => {
  it('asks mermaid for plain SVG labels ahead of the diagram', () => {
    const out = mermaidExportSource('  graph TD\n  A --> B\n');
    const [directive, ...rest] = out.split('\n');
    expect(directive).toContain('"htmlLabels": false');
    expect(directive).toContain('"flowchart": {"htmlLabels": false}');
    expect(rest.join('\n')).toBe('graph TD\n  A --> B');
  });
});
