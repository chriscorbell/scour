import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toastError } from "../components/ui/Toast.tsx";
import { ApiError, errorMessage } from "./api.ts";
import { createLive } from "./live.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return count < 2;
      },
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return;
      toastError(errorMessage(error));
    },
  }),
});

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { silent?: boolean };
  }
}

export const live = createLive(queryClient);
