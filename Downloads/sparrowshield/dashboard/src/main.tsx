import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,   // 5 min — data is fresh, no unnecessary refetch
      gcTime:    10 * 60_000,  // 10 min — keep cache alive after unmount
      refetchInterval: false,  // disable global polling; each hook opts in explicitly
      refetchOnWindowFocus: false, // don't blast requests on tab switch
      retry: 1,                // one retry is enough for transient errors
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
