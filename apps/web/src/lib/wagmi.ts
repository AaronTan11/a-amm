import { getDefaultConfig } from "connectkit";
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";

export const config = createConfig(
  getDefaultConfig({
    chains: [sepolia],
    transports: {
      [sepolia.id]: http("https://eth-sepolia.g.alchemy.com/v2/hM0KzZPuizy-BDEWjpOzm"),
    },
    walletConnectProjectId: import.meta.env["VITE_WC_PROJECT_ID"] ?? "",
    appName: "A-AMM",
    appDescription: "Agentic Automated Market Maker",
    enableFamily: false,
  }),
);
