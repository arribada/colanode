export type PlaneSyncRunMutationInput = {
  type: 'plane.sync.run';
  userId: string;
};

export type PlaneSyncRunMutationOutput = {
  // False with `running: true` means a sync was already under way — the
  // button was pressed twice, or the schedule is mid-cycle. Not a failure.
  started: boolean;
  running?: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'plane.sync.run': {
      input: PlaneSyncRunMutationInput;
      output: PlaneSyncRunMutationOutput;
    };
  }
}
