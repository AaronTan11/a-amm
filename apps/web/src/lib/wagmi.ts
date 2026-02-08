import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

export const config = createConfig({
  chains: [sepolia],
  ssr: true,
  connectors: [
    injected(),
    walletConnect({
      projectId: import.meta.env["VITE_WC_PROJECT_ID"] ?? "",
    }),
  ],
  transports: {
    [sepolia.id]: http(
      "https://eth-sepolia.g.alchemy.com/v2/hM0KzZPuizy-BDEWjpOzm",
    ),
  },
});
