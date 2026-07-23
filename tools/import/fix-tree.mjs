// ABOUTME: Post-import tree cleanup for the AFFiNE -> Colanode wiki import (workspace 'Arribada Wiki').
// ABOUTME: Re-attaches docs whose ' / ' titles were mis-split into fragment container chains, deletes the
// ABOUTME: now-empty fragment containers, and removes the 'ZZZ TEST CLAUDE (delete me)' space entirely.
//
// RUN (from the droplet — repo + this dir mounted at their real paths so tsconfig paths hold):
//   docker run --rm --network host \
//     -v /root/colanode-fork-agasi:/root/colanode-fork-agasi \
//     -v /root/colanode-import:/root/colanode-import \
//     -w /root/colanode-fork-agasi \
//     node:22-bookworm-slim npx tsx --tsconfig /root/colanode-import/tsconfig.json /root/colanode-import/fix-tree.mjs
//
// Prereq: /root/colanode-import/data holds the wiki-import session (created by proof.mjs).
// The script first waits for the headless client to fully sync the workspace down from the
// server (the import was done over raw HTTP, so the local db starts almost empty), then runs
// every move/delete through the official mutation pipeline and flushes the outbox.

import fs from 'node:fs';

import { AppService } from '@colanode/client/services/app-service';
import {
  NodeFileSystem,
  NodeKyselyService,
  NodePathService,
} from '@colanode/client-node';

const SERVER_URL = process.env.COLANODE_URL ?? 'https://colanode.157.245.42.241.sslip.io';
const EMAIL = 'wiki-import@arribada.org';
const DATA_DIR = process.env.COLANODE_DATA_DIR ?? '/root/colanode-import/data';
const ASSETS_DIR = '/root/colanode-fork-agasi/apps/desktop/assets';
const WORKSPACE_ID = '01ky60b09cad2nyfk7c75e6555wc'; // 'Arribada Wiki'
const ZZZ_SPACE_NAME = 'ZZZ TEST CLAUDE (delete me)';
const LOG_FILE = '/root/colanode-import/fix-tree.log';
const SEPARATOR = ' / '; // exactly what import-affine.mjs split manifest paths on

const SYNC_STABLE_POLLS = 8; // counts unchanged for 8 x 5s = 40s => synced
const SYNC_POLL_MS = 5000;
const SYNC_TIMEOUT_MS = 20 * 60 * 1000;
const SYNC_MIN_NODES = 2000; // server currently holds 2189 nodes for this workspace

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Execute a mutation through the mediator; throw on failure. NOTE: the node.update /
// node.delete handlers report success even for not_found/unauthorized, so callers must
// re-check the local db after each call (verifyMoved / verifyDeleted below).
const mutate = async (app, input) => {
  const result = await app.mediator.executeMutation(input);
  if (!result.success) {
    throw new Error(`${input.type} failed: ${result.error.code} — ${result.error.message}`);
  }
  return result.output;
};

const loadTree = async (db) => {
  const rows = await db.selectFrom('nodes').select(['id', 'type', 'parent_id', 'attributes']).execute();
  const byId = new Map();
  const childrenOf = new Map();
  for (const row of rows) {
    const attributes = JSON.parse(row.attributes);
    const node = { id: row.id, type: row.type, parentId: row.parent_id, attributes, name: attributes.name ?? null };
    byId.set(node.id, node);
    if (node.parentId) {
      if (!childrenOf.has(node.parentId)) childrenOf.set(node.parentId, []);
      childrenOf.get(node.parentId).push(node);
    }
  }
  const docRows = await db.selectFrom('documents').select(['id']).execute();
  const docIds = new Set(docRows.map((r) => r.id));
  return { byId, childrenOf, docIds, total: rows.length };
};

const main = async () => {
  fs.writeFileSync(LOG_FILE, '');
  log('fix-tree starting');

  const app = new AppService(
    { type: 'desktop', platform: process.platform },
    new NodeFileSystem(),
    new NodeKyselyService(),
    new NodePathService(DATA_DIR, ASSETS_DIR)
  );
  await app.init();
  log(`engine booted, accounts: ${app.getAccounts().length}`);

  const account = app.getAccounts().find((a) => a.account.email === EMAIL);
  if (!account) throw new Error(`no local session for ${EMAIL} — run proof.mjs first`);
  log(`account: ${account.id} (${account.account.email})`);

  const workspaces = await app.mediator.executeQuery({ type: 'workspace.list' });
  const ws = workspaces.find((w) => w.workspaceId === WORKSPACE_ID);
  if (!ws) throw new Error(`workspace ${WORKSPACE_ID} not registered locally`);
  const userId = ws.userId;
  const workspace = app.getWorkspace(userId);
  if (!workspace) throw new Error(`no workspace service for userId ${userId}`);
  log(`workspace: ${ws.name} (${WORKSPACE_ID}) userId=${userId}`);

  // ---- 1. Wait for the initial server -> client sync to finish (counts stable).
  const counts = async () => {
    const n = await workspace.database
      .selectFrom('nodes')
      .select(({ fn }) => fn.countAll().as('c'))
      .executeTakeFirst();
    const d = await workspace.database
      .selectFrom('documents')
      .select(({ fn }) => fn.countAll().as('c'))
      .executeTakeFirst();
    return { nodes: Number(n?.c ?? 0), documents: Number(d?.c ?? 0) };
  };

  const started = Date.now();
  let stable = 0;
  let last = { nodes: -1, documents: -1 };
  for (;;) {
    if (Date.now() - started > SYNC_TIMEOUT_MS) {
      throw new Error(`sync-down timed out: nodes=${last.nodes} documents=${last.documents}`);
    }
    const cur = await counts();
    if (cur.nodes === last.nodes && cur.documents === last.documents && cur.nodes >= SYNC_MIN_NODES) {
      stable++;
      if (stable >= SYNC_STABLE_POLLS) break;
    } else {
      if (cur.nodes !== last.nodes || cur.documents !== last.documents) {
        log(`sync-down progress: nodes=${cur.nodes} documents=${cur.documents}`);
      }
      stable = 0;
      last = cur;
    }
    await sleep(SYNC_POLL_MS);
  }
  log(`sync-down stable: nodes=${last.nodes} documents=${last.documents}`);

  // ---- 2. Scan the tree and build the cleanup plan.
  const tree = await loadTree(workspace.database);
  log(`tree loaded: ${tree.total} nodes, ${tree.docIds.size} documents`);

  const slashedPages = [...tree.byId.values()].filter(
    (n) => n.type === 'page' && typeof n.name === 'string' && n.name.includes(SEPARATOR)
  );
  const slashedDocs = slashedPages.filter((n) => tree.docIds.has(n.id));
  const slashedNoDoc = slashedPages.filter((n) => !tree.docIds.has(n.id));
  log(`slashed-title pages: ${slashedPages.length} (${slashedDocs.length} with documents)`);
  if (slashedNoDoc.length > 0) {
    for (const n of slashedNoDoc) log(`WARN slashed page without document (left untouched): ${n.id} "${n.name}"`);
  }

  const plans = [];
  const skips = [];
  const claimedFragmentIds = new Set();
  for (const doc of slashedDocs) {
    const segments = doc.name.split(SEPARATOR);
    const fragmentCount = segments.length - 1;
    const chain = []; // [immediate parent, ..., top fragment]
    let cursor = doc;
    let skip = null;
    for (let i = 1; i <= fragmentCount; i++) {
      const parent = cursor.parentId ? tree.byId.get(cursor.parentId) : undefined;
      const expectedName = segments[fragmentCount - i];
      if (!parent) {
        skip = `ancestor ${i} missing (parentId=${cursor.parentId})`;
      } else if (parent.type !== 'page') {
        skip = `ancestor ${i} "${parent.name}" is a ${parent.type}, not a page`;
      } else if (parent.name !== expectedName) {
        skip = `ancestor ${i} "${parent.name}" != expected fragment "${expectedName}"`;
      } else if ((tree.childrenOf.get(parent.id) ?? []).length !== 1) {
        skip = `ancestor ${i} "${parent.name}" has ${(tree.childrenOf.get(parent.id) ?? []).length} children (not a pure fragment)`;
      } else if (tree.docIds.has(parent.id)) {
        skip = `ancestor ${i} "${parent.name}" has document content of its own`;
      } else if (claimedFragmentIds.has(parent.id)) {
        skip = `ancestor ${i} "${parent.name}" already claimed by another chain`;
      }
      if (skip) break;
      chain.push(parent);
      cursor = parent;
    }
    if (!skip) {
      const top = chain[chain.length - 1];
      const newParent = top.parentId ? tree.byId.get(top.parentId) : undefined;
      if (!newParent) skip = `top fragment "${top.name}" has no resolvable parent`;
      else {
        for (const f of chain) claimedFragmentIds.add(f.id);
        plans.push({ doc, chain, newParent });
      }
    }
    if (skip) {
      skips.push({ doc, reason: skip });
      log(`SKIP "${doc.name}" (${doc.id}): ${skip}`);
    }
  }
  log(`plan: ${plans.length} docs to move, ${plans.reduce((a, p) => a + p.chain.length, 0)} fragment containers to delete, ${skips.length} skipped`);

  // ---- 3. Execute: move each doc up, then delete its fragment chain children-first.
  const reload = async (id) => {
    const row = await workspace.database
      .selectFrom('nodes')
      .select(['id', 'attributes', 'parent_id'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? { ...row, attributes: JSON.parse(row.attributes) } : undefined;
  };

  let moves = 0;
  let fragmentDeletes = 0;
  for (const plan of plans) {
    const fresh = await reload(plan.doc.id);
    if (!fresh) throw new Error(`doc ${plan.doc.id} vanished before move`);
    await mutate(app, {
      type: 'node.update',
      userId,
      nodeId: plan.doc.id,
      attributes: { ...fresh.attributes, parentId: plan.newParent.id },
    });
    const after = await reload(plan.doc.id);
    if (!after || after.parent_id !== plan.newParent.id) {
      throw new Error(`move of ${plan.doc.id} "${plan.doc.name}" did not apply locally`);
    }
    moves++;
    log(`MOVE doc ${plan.doc.id} "${plan.doc.name}": parent ${plan.doc.parentId} "${plan.chain[0].name}" -> ${plan.newParent.id} "${plan.newParent.name}"`);

    for (const fragment of plan.chain) {
      // chain is ordered deepest-first, so each delete happens on an already-childless page
      await mutate(app, { type: 'node.delete', userId, nodeId: fragment.id });
      const gone = await reload(fragment.id);
      if (gone) throw new Error(`delete of fragment ${fragment.id} "${fragment.name}" did not apply locally`);
      fragmentDeletes++;
      log(`DELETE fragment container ${fragment.id} "${fragment.name}"`);
    }
  }

  // ---- 4. Delete the ZZZ TEST space entirely (children-first).
  const zzz = [...tree.byId.values()].find((n) => n.type === 'space' && n.name === ZZZ_SPACE_NAME);
  let zzzDeletes = 0;
  if (!zzz) {
    log(`WARN space "${ZZZ_SPACE_NAME}" not found — nothing to delete`);
  } else {
    const deleteSubtree = async (node) => {
      for (const child of tree.childrenOf.get(node.id) ?? []) {
        await deleteSubtree(child);
      }
      await mutate(app, { type: 'node.delete', userId, nodeId: node.id });
      const gone = await reload(node.id);
      if (gone) throw new Error(`delete of ${node.id} "${node.name}" (${node.type}) did not apply locally`);
      zzzDeletes++;
      log(`DELETE ${node.type} ${node.id} "${node.name}" (ZZZ TEST subtree)`);
    };
    await deleteSubtree(zzz);
  }

  // ---- 5. Flush the outbox: drive MutationService.sync() until empty.
  let remaining = -1;
  for (let attempt = 0; attempt < 120; attempt++) {
    await workspace.mutations.sync();
    const row = await workspace.database
      .selectFrom('mutations')
      .select(({ fn }) => fn.countAll().as('c'))
      .executeTakeFirst();
    remaining = Number(row?.c ?? 0);
    if (remaining === 0) break;
    log(`waiting for sync flush — ${remaining} pending mutations`);
    await sleep(1000);
  }
  if (remaining !== 0) throw new Error(`sync did not flush: ${remaining} mutations still pending`);
  log('sync flushed — all mutations acked by server');

  const summary = {
    moves,
    fragmentDeletes,
    zzzDeletes,
    skips: skips.map((s) => ({ id: s.doc.id, name: s.doc.name, reason: s.reason })),
  };
  log(`SUMMARY ${JSON.stringify(summary)}`);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
};

main().catch((error) => {
  log(`FATAL: ${error?.stack ?? error?.message ?? error}`);
  process.exit(1);
});
