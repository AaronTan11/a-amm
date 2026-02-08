import { useWatchContractEvent } from "wagmi";
import { toast } from "sonner";

import { HOOK_ADDRESS, aammHookAbi } from "@/lib/contracts";

interface EventCallbacks {
  onIntentCreated?: () => void;
  onIntentFilled?: () => void;
  onIntentCancelled?: () => void;
  onIntentFallback?: () => void;
}

export function useIntentEvents(callbacks: EventCallbacks) {
  useWatchContractEvent({
    address: HOOK_ADDRESS,
    abi: aammHookAbi,
    eventName: "IntentCreated",
    onLogs(logs) {
      for (const log of logs) {
        const { intentId } = log.args;
        if (intentId !== undefined) {
          toast.info(`Intent #${intentId} created`);
          callbacks.onIntentCreated?.();
        }
      }
    },
  });

  useWatchContractEvent({
    address: HOOK_ADDRESS,
    abi: aammHookAbi,
    eventName: "IntentFilled",
    onLogs(logs) {
      for (const log of logs) {
        const { intentId, agent } = log.args;
        if (intentId !== undefined) {
          toast.success(`Intent #${intentId} filled`, {
            description: agent ? `Agent: ${agent.slice(0, 8)}...` : undefined,
          });
          callbacks.onIntentFilled?.();
        }
      }
    },
  });

  useWatchContractEvent({
    address: HOOK_ADDRESS,
    abi: aammHookAbi,
    eventName: "IntentCancelled",
    onLogs(logs) {
      for (const log of logs) {
        const { intentId } = log.args;
        if (intentId !== undefined) {
          toast(`Intent #${intentId} cancelled`);
          callbacks.onIntentCancelled?.();
        }
      }
    },
  });

  useWatchContractEvent({
    address: HOOK_ADDRESS,
    abi: aammHookAbi,
    eventName: "IntentFallback",
    onLogs(logs) {
      for (const log of logs) {
        const { intentId } = log.args;
        if (intentId !== undefined) {
          toast.warning(`Intent #${intentId} fell back to AMM`);
          callbacks.onIntentFallback?.();
        }
      }
    },
  });
}
