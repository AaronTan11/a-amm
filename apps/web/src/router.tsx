import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClientOnly, createRouter as createTanStackRouter } from "@tanstack/react-router";
import { WagmiProvider } from "wagmi";

import ConnectKitWrapper from "./components/connectkit-wrapper";
import Loader from "./components/loader";
import "./index.css";
import { config } from "./lib/wagmi";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient();

export const getRouter = () => {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultSsr: false,
    context: {},
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: () => <div>Not Found</div>,
    Wrap: ({ children }) => (
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <ClientOnly fallback={children}>
            <ConnectKitWrapper>{children}</ConnectKitWrapper>
          </ClientOnly>
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
