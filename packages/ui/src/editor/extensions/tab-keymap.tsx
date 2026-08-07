import { Extension } from '@tiptap/core';

// Tab is context-aware. Inside a table it walks between cells like a spreadsheet
// (and grows a new row when you tab past the last cell); everywhere else it keeps
// the previous behavior of inserting a literal tab character. Shift-Tab mirrors
// it: previous cell inside a table, otherwise remove a preceding tab character.
export const TabKeymapExtension = Extension.create({
  name: 'tabKeymap',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const editor = this.editor;
        if (editor.isActive('table')) {
          if (editor.can().goToNextCell()) {
            return editor.commands.goToNextCell();
          }
          // Past the last cell: grow the table the way every spreadsheet does.
          return editor.chain().addRowAfter().goToNextCell().run();
        }
        return editor.commands.insertContent('\t');
      },
      'Shift-Tab': () => {
        const editor = this.editor;
        if (editor.isActive('table')) {
          if (editor.can().goToPreviousCell()) {
            return editor.commands.goToPreviousCell();
          }
          // At the first cell: swallow Shift-Tab so focus stays in the table.
          return true;
        }

        const { tr, selection } = editor.view.state;
        const tabPosition = selection.$from.pos - 1;
        if (tabPosition < 0) {
          return false;
        }
        const textBetween = tr.doc.textBetween(tabPosition, tabPosition + 1);

        if (textBetween === '\t') {
          tr.delete(tabPosition, tabPosition + 1);
          editor.view.dispatch(tr);
          return true;
        }

        return false;
      },
    };
  },
});
