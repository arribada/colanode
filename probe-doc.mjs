import { mapContentsToBlocks } from '@colanode/client/lib';
import { generateId, IdType, richTextContentSchema } from '@colanode/core';
import { encodeState, YDoc } from '@colanode/crdt';

const paragraph = (t) => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] });
const heading = (t) => ({ type: 'heading3', content: [{ type: 'text', text: t }] });
const listItem = (t) => ({ type: 'listItem', content: [paragraph(t)] });

const recordId = generateId(IdType.Record);
const contents = [
  heading('Context'),
  paragraph('Hello world, this is a probe.'),
  { type: 'bulletList', content: [listItem('option a'), listItem('option b')] },
];
const blocks = mapContentsToBlocks(recordId, contents, new Map());
const ydoc = new YDoc();
const update = ydoc.update(richTextContentSchema, { type: 'rich_text', blocks });
const b64 = update ? encodeState(update) : null;
console.log('recordId=', recordId);
console.log('blocks count=', Object.keys(blocks).length, 'update?', !!update, 'b64 len=', b64 ? b64.length : 0);
console.log('sample block=', JSON.stringify(Object.values(blocks)[0]));
