import { createContext, useContext } from 'react';

interface SearchContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const SearchContext = createContext<SearchContextValue>({
  open: false,
  setOpen: () => {},
});

export const useSearch = () => useContext(SearchContext);
