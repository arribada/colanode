import { Github } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

// Quick way to cite an Arribada GitHub repo (and optionally a commit or path)
// as an inline link. No API / credentials — it only builds a github.com URL.
export const GithubCommand: EditorCommand = {
  key: 'github',
  name: 'GitHub link',
  description: 'Cite an Arribada repo or commit',
  keywords: ['github', 'git', 'repo', 'commit', 'arribada', 'code'],
  icon: Github,
  group: 'embeds',
  disabled: false,
  handler: ({ editor, range }) => {
    const repo = window.prompt('Arribada repo (e.g. linkit-v4-core):')?.trim();
    if (!repo) {
      editor.chain().focus().deleteRange(range).run();
      return;
    }

    const ref = window
      .prompt('Commit SHA or path (optional — leave empty for the repo):')
      ?.trim();

    let href = `https://github.com/arribada/${repo}`;
    let label = `arribada/${repo}`;
    if (ref) {
      if (/^[0-9a-f]{7,40}$/i.test(ref)) {
        href += `/commit/${ref}`;
        label += `@${ref.slice(0, 7)}`;
      } else {
        const clean = ref.replace(/^\/+/, '');
        href += `/${clean}`;
        label += `/${clean}`;
      }
    }

    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent([
        { type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] },
        { type: 'text', text: ' ' },
      ])
      .run();
  },
};
