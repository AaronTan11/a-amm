import { getDefaultConfig } from "connectkit";
import { createConfig, http } from "wagmi";
import { foundry, sepolia } from "wagmi/chains";

export const config = createConfig(
  getDefaultConfig({
    chains: [foundry, sepolia],
    transports: {
      [foundry.id]: http("http://127.0.0.1:8545"),
      [sepolia.id]: http(),
    },
    walletConnectProjectId: import.meta.env["VITE_WC_PROJECT_ID"] ?? "",
    appName: "A-AMM",
    appDescription: "Agentic Automated Market Maker",
    enableFamily: false,
  }),
);
