import { User } from '@colanode/client/types/users';

export type UserSearchQueryInput = {
  type: 'user.search';
  searchQuery: string;
  userId: string;
  exclude?: string[];
  // Opt-in for the live add-collaborator / mention flows only. The shared
  // pickers (view filters, record person field) must still be able to select
  // the current user and to surface removed users for historical filtering.
  excludeSelf?: boolean;
  activeOnly?: boolean;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'user.search': {
      input: UserSearchQueryInput;
      output: User[];
    };
  }
}
