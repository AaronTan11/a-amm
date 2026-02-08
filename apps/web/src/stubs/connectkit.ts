// SSR stub — ConnectKit accesses `window` at module load time, crashing serverless functions.
// This no-op replacement is aliased in for the nitro server build only.
import { createConfig } from "wagmi";

export const ConnectKitProvider = ({ children }: { children: any }) => children;
export const ConnectKitButton = {
  Custom: ({ children }: { children: any }) => children({}),
};
export const getDefaultConfig = (config: any) => config;
