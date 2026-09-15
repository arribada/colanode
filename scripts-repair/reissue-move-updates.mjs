// Repairs nodes that a fresh client cannot build because, in revision order,
// their first node update is not the create.
//
// Sync streams node_updates per root in revision order, and the client builds a
// node from the FIRST update it receives for it (tryCreateServerNode). Two
// server paths used to give older rows newer revisions -- a cross-space move
// re-homed the history AFTER inserting the move, and the merge job merged a
// node's create into a row that then outranked later updates. A fresh client
// then received e.g. the move first, could not build a node from it (no type),
// dropped it after its retries, and stored the create under the old parent.
//
// The repair re-issues every update that precedes the create, byte for byte, as
// a NEW row (new id, same node/root/workspace/data/author). Its revision is
// higher than the create's, so a client that dropped it applies it after the
// create; a client that already has it merges identical Yjs bytes to no change
// (tryUpdateServerNode skips the write). The original rows stay: removing them
// would change nothing for clients and lose history.
//
// created_at is the time of the repair, not the original: the merge job only
// considers rows older than its cutoff window, and a fresh timestamp keeps the
// re-issued rows out of any merge group that could reach back to the create.
//
// Dry run (default) opens a READ ONLY transaction and only prints the plan:
//   POSTGRES_URL=postgres://... node scripts-repair/reissue-move-updates.mjs
// Apply:
//   POSTGRES_URL=postgres://... node scripts-repair/reissue-move-updates.mjs --apply
// Restrict to one workspace with --workspace <id>.
//
// Run it only once the server that no longer produces this ordering is live,
// or new victims can appear after the repair.
import pg from 'pg';
import { ulid } from 'ulid';
import * as Y from 'yjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const workspaceFlag = args.indexOf('--workspace');
const workspaceId = workspaceFlag >= 0 ? args[workspaceFlag + 1] : null;

if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL is required');
  process.exit(2);
}

// Same shape as generateId(IdType.Update) in @colanode/core.
const newUpdateId = () => ulid().toLowerCase() + 'ud';

// What a client can build from these updates alone: the `object` map's type.
const typeOf = (updates) => {
  const doc = new Y.Doc();
  for (const update of updates) {
    Y.applyUpdate(doc, update);
  }
  const type = doc.getMap('object').get('type');
  doc.destroy();
  return typeof type === 'string' ? type : null;
};

const client = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await client.connect();
await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');

let exitCode = 0;
try {
  // One row per node: the first update a client of its root receives.
  const firsts = await client.query(
    `select distinct on (u.node_id) u.node_id, u.id, u.data
       from node_updates u
      where ($1::text is null or u.workspace_id = $1)
      order by u.node_id, u.revision asc`,
    [workspaceId]
  );

  const suspects = firsts.rows
    .filter((row) => typeOf([row.data]) === null)
    .map((row) => row.node_id);

  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'}: ${firsts.rows.length} nodes checked, ` +
      `${suspects.length} whose first update carries no type`
  );

  let planned = 0;
  for (const nodeId of suspects) {
    const { rows: updates } = await client.query(
      `select u.id, u.node_id, u.root_id, u.workspace_id, u.revision::text as revision,
              u.data, u.created_at, u.created_by,
              n.type as node_type, n.root_id as node_root,
              left(n.attributes->>'name', 60) as name
         from node_updates u
         left join nodes n on n.id = u.node_id
        where u.node_id = $1
        order by u.revision asc`,
      [nodeId]
    );

    const head = updates[0];
    const label = `${nodeId} ${head.node_type ?? '(no node row)'} "${head.name ?? ''}"`;

    if (!head.node_type) {
      console.log(`SKIP ${label}: the node itself is gone`);
      continue;
    }

    const roots = new Set(updates.map((u) => u.root_id));
    if (roots.size !== 1 || !roots.has(head.node_root)) {
      console.log(
        `SKIP ${label}: updates span roots ${[...roots].join(',')} ` +
          `but the node is in ${head.node_root} -- not this problem`
      );
      exitCode = 1;
      continue;
    }

    const createIndex = updates.findIndex((u) => typeOf([u.data]) !== null);
    if (createIndex <= 0) {
      console.log(
        `SKIP ${label}: no single update carries the type, cannot choose a create`
      );
      exitCode = 1;
      continue;
    }

    const create = updates[createIndex];
    const before = updates.slice(0, createIndex);
    const fullType = typeOf(updates.map((u) => u.data));
    if (fullType !== head.node_type) {
      console.log(
        `SKIP ${label}: full history builds type ${fullType}, node row says ${head.node_type}`
      );
      exitCode = 1;
      continue;
    }

    console.log(
      `NODE ${label} root=${head.node_root} create=${create.id}@${create.revision} ` +
        `(${create.created_at.toISOString()})`
    );

    for (const row of before) {
      const id = newUpdateId();
      planned += 1;
      console.log(
        `  reissue ${row.id}@${row.revision} (${row.created_at.toISOString()}, ` +
          `${row.data.length} B, by ${row.created_by}) as ${id}`
      );
      if (apply) {
        const inserted = await client.query(
          `insert into node_updates (id, node_id, root_id, workspace_id, data, created_at, created_by)
           values ($1, $2, $3, $4, $5, now(), $6)
           returning revision::text as revision`,
          [
            id,
            row.node_id,
            head.node_root,
            row.workspace_id,
            row.data,
            row.created_by,
          ]
        );
        console.log(`    inserted at revision ${inserted.rows[0].revision}`);
      }
    }

    // What a fresh client would now receive, in order.
    const replay = [...updates.slice(createIndex), ...before];
    if (typeOf([replay[0].data]) !== head.node_type) {
      throw new Error(
        `replay for ${nodeId} still does not start with the create`
      );
    }
  }

  console.log(
    `${planned} update(s) ${apply ? 'inserted' : 'would be inserted'}`
  );

  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error);
  exitCode = 1;
} finally {
  await client.end();
}

process.exit(exitCode);
