import { getKvConfig, setKvConfig } from "./kv-config";
import { now } from "./utils";
import type { BusinessContext } from "@/types/business-context";
import { DEFAULT_BUSINESS_CONTEXT } from "@/types/business-context";

const KV_KEY = "business-context";

export async function getBusinessContext(): Promise<BusinessContext> {
  return getKvConfig<BusinessContext>(KV_KEY, DEFAULT_BUSINESS_CONTEXT);
}

export async function updateBusinessContext(
  updates: Partial<Omit<BusinessContext, "createdAt" | "updatedAt">>
): Promise<BusinessContext> {
  const current = await getBusinessContext();
  const updated: BusinessContext = {
    ...current,
    ...updates,
    keyMessages: updates.keyMessages ?? current.keyMessages,
    differentiators: updates.differentiators ?? current.differentiators,
    updatedAt: now(),
    createdAt: current.createdAt || now(),
  };
  await setKvConfig(KV_KEY, updated);
  return updated;
}
