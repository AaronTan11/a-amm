import { ConnectKitProvider } from "connectkit";
import type { ReactNode } from "react";

export default function ConnectKitWrapper({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConnectKitProvider mode="dark" theme="midnight">
      {children}
    </ConnectKitProvider>
  );
}
