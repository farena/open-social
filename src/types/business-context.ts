export interface BusinessContext {
  summary: string;
  audience: string;
  products: string;
  tone: string;
  keyMessages: string[];
  differentiators: string[];
  competitors: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_BUSINESS_CONTEXT: BusinessContext = {
  summary: "",
  audience: "",
  products: "",
  tone: "",
  keyMessages: [],
  differentiators: [],
  competitors: "",
  notes: "",
  createdAt: "",
  updatedAt: "",
};

export function isBusinessContextConfigured(ctx: BusinessContext): boolean {
  return (
    ctx.summary.trim().length > 0 ||
    ctx.audience.trim().length > 0 ||
    ctx.products.trim().length > 0
  );
}
