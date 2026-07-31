import { bootEngine } from '@colanode/client-node';

// One-time admin-run script: add the bot user (COLANODE_BOT_EMAIL) to every
// workspace the admin account belongs to. Run AFTER the bot account exists
// (registered separately). Uses ADMIN creds, not the bot creds, and a SEPARATE
// admin data dir (pass a distinct COLANODE_DATA_DIR when running provision).
const main = async (): Promise<void> => {
  const app = await bootEngine({
    serverUrl: process.env.COLANODE_SERVER_URL!,
    email: process.env.COLANODE_ADMIN_EMAIL!,
    password: process.env.COLANODE_ADMIN_PASSWORD!,
    dataDir: process.env.COLANODE_DATA_DIR!,
  });
  const botEmail = process.env.COLANODE_BOT_EMAIL!;
  const workspaces = await app.mediator.executeQuery({ type: 'workspace.list' });
  for (const workspace of workspaces) {
    const result = await app.mediator.executeMutation({
      type: 'users.create',
      userId: workspace.userId,
      users: [{ email: botEmail, role: 'collaborator' }],
    });
    if (!result.success) {
      console.error(`${workspace.name}: ${result.error.message}`);
      continue;
    }
    console.log(
      `${workspace.name}: added`,
      result.output.users.map((u) => ({ id: u.id, email: u.email }))
    );
  }
  process.exit(0);
};
main().catch((error) => {
  console.error('provision failed:', error);
  process.exit(1);
});
