// ABOUTME: The editor's heading levels in one place: which node names are headings
// ABOUTME: and at what level, for the tables of contents and the numbering.

export const MAX_HEADING_LEVEL = 5;

/** The level of a heading node (1 to 5), or 0 for any other node. */
export const headingLevel = (nodeName: string): number => {
  const match = /^heading([1-5])$/.exec(nodeName);
  return match ? Number(match[1]) : 0;
};
