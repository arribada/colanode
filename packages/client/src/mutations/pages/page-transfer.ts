export type PageTransferMutationInput = {
  type: 'page.transfer';
  // The source workspace membership id the page currently lives in.
  userId: string;
  pageId: string;
  // The destination workspace membership id and the parent (space or page) the
  // copy should land under.
  targetUserId: string;
  targetParentId: string;
  // When true, the original page is moved to the source workspace's trash after
  // a successful copy (recoverable). When false the original is kept (a copy).
  trashOriginal: boolean;
};

export type PageTransferMutationOutput = {
  id: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'page.transfer': {
      input: PageTransferMutationInput;
      output: PageTransferMutationOutput;
    };
  }
}
