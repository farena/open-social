import { readDataSafe, writeData } from "./data";
import { now } from "./utils";
import type { BusinessContext } from "@/types/business-context";
import { DEFAULT_BUSINESS_CONTEXT } from "@/types/business-context";

const FILE = "business-context.json";

export async function getBusinessContext(): Promise<BusinessContext> {
  return readDataSafe<BusinessContext>(FILE, DEFAULT_BUSINESS_CONTEXT);
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
  await writeData(FILE, updated);
  return updated;
}
