// Moves page and record bodies that an earlier cross-space move left behind
// in the old root.
//
// Documents are streamed per root, like node updates. A cross-space move used
// to re-home the node's updates but never its document's, so the body kept
// arriving only through the OLD space: anyone who has the new space but not
// the old one sees the page with an empty body.
//
// Each stray document_updates row gets the node's current root and a NEW
// revision, in its original revision order. The new revision is what makes the
// new root's document synchronizer send it: its clients are already past the
// old one. A client that already has the body merges identical Yjs bytes to no
// change. document_updates has no revision trigger (migration 00028), so the
// revision is assigned explicitly.
//
// Dry run (default) opens a READ ONLY transaction and only prints the plan:
//   POSTGRES_URL=postgres://... node scripts-repair/rehome-document-updates.mjs
// Apply:
//   POSTGRES_URL=postgres://... node scripts-repair/rehome-document-updates.mjs --apply
// Restrict to one workspace with --workspace <id>.
//
// Run it only once the server whose moves re-home documents is live, or new
// strays can appear after the repair.
import pg from 'pg';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const workspaceFlag = args.indexOf('--workspace');
const workspaceId = workspaceFlag >= 0 ? args[workspaceFlag + 1] : null;

if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL is required');
  process.exit(2);
}

const client = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await client.connect();
await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');

let exitCode = 0;
try {
  const { rows } = await client.query(
    `select du.id, du.document_id, du.root_id, du.revision::text as revision,
            du.created_at, length(du.data) as bytes,
            n.type, n.root_id as node_root, left(n.attributes->>'name', 60) as name
       from document_updates du
       join nodes n on n.id = du.document_id
      where du.root_id <> n.root_id
        and ($1::text is null or du.workspace_id = $1)
      order by du.revision asc`,
    [workspaceId]
  );

  const documents = new Set(rows.map((row) => row.document_id));
  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'}: ${rows.length} document update(s) of ` +
      `${documents.size} document(s) sit outside their node's root`
  );

  const byMove = new Map();
  for (const row of rows) {
    const key = `${row.root_id} -> ${row.node_root}`;
    byMove.set(key, (byMove.get(key) ?? 0) + 1);
  }
  for (const [key, count] of byMove) {
    console.log(`  ${count} row(s) ${key}`);
  }

  for (const row of rows) {
    console.log(
      `${row.document_id} ${row.type} "${row.name ?? ''}" ` +
        `update ${row.id}@${row.revision} (${row.bytes} B) ` +
        `${row.root_id} -> ${row.node_root}`
    );
    if (apply) {
      const updated = await client.query(
        `update document_updates
            set root_id = $1,
                revision = nextval('document_updates_revision_sequence')
          where id = $2 and root_id = $3
          returning revision::text as revision`,
        [row.node_root, row.id, row.root_id]
      );
      if (updated.rowCount !== 1) {
        throw new Error(`document update ${row.id} changed under the repair`);
      }
      console.log(`    now at revision ${updated.rows[0].revision}`);
    }
  }

  console.log(
    `${rows.length} row(s) ${apply ? 're-homed' : 'would be re-homed'}`
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
