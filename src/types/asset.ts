export interface Asset {
  id: string;
  url: string;            // e.g. "/uploads/abc.png" — what slides reference
  name: string;           // user-friendly label
  description?: string;   // optional hint for the AI ("transparent logo", "founder photo", etc.)
  addedAt: string;
}

export interface AssetsData {
  assets: Asset[];
}
