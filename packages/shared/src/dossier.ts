import { z } from "zod";

export const DossierConfidenceSchema = z.enum(["low", "med", "high"]);

export const DossierSchema = z.object({
  confirmed: z.array(z.string()),
  asserted: z.array(z.string()),
  contradicted: z.array(z.string()),
  recommendation_bps: z.number().int().min(0).max(10000),
  confidence: DossierConfidenceSchema,
  notes: z.string(),
});

export type DossierConfidence = z.infer<typeof DossierConfidenceSchema>;
export type Dossier = z.infer<typeof DossierSchema>;
