import React from 'react';
import ReactDOM from 'react-dom';

// Dev-only runtime accessibility audit.
//
// @axe-core/react is a devDependency only (see packages/ui/package.json).
// It is loaded via dynamic import guarded by NODE_ENV so it is never
// resolved or bundled into production builds (desktop, web, or the mobile
// WebView bundle) — it only runs during local development. react/react-dom
// stay as regular static imports since they already ship in every build;
// only the audit library itself needs to be kept out of prod.
export const runA11yAudit = () => {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  void import('@axe-core/react').then(({ default: axe }) => {
    axe(React, ReactDOM, 1000);
  });
};
