import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { lazy, Suspense, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import Loader from "./components/loader";
import "./index.css";
import { config } from "./lib/wagmi";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient();

// Lazy-load ConnectKit only on client — family.mjs crashes during SSR
// import.meta.env.SSR is replaced at build time, so the dynamic import
// is tree-shaken from the SSR bundle entirely
const ConnectKitWrapper: React.ComponentType<{ children: ReactNode }> =
  import.meta.env.SSR
    ? ({ children }: { children: ReactNode }) => <>{children}</>
    : lazy(() =>
        import("connectkit").then((mod) => ({
          default: ({ children }: { children: ReactNode }) => (
            <mod.ConnectKitProvider mode="dark" theme="midnight">
              {children}
            </mod.ConnectKitProvider>
          ),
        })),
      );

export const getRouter = () => {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: {},
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: () => <div>Not Found</div>,
    Wrap: ({ children }) => (
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={children}>
            <ConnectKitWrapper>{children}</ConnectKitWrapper>
          </Suspense>
        </QueryClientProvider>
      </WagmiProvider>
    ),
  });
  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
