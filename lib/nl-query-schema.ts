import { z } from "zod";

export const DIMENSION_VALUES = ["age", "city", "sector", "source", "case_status", "placement_category"] as const;

export const PivotQuerySchema = z.object({
  dimensions: z.array(z.enum(DIMENSION_VALUES)).max(4).default([]),
  filters: z.object({
    age_range: z.tuple([z.number(), z.number()]).optional(),
    city: z.array(z.string()).optional(),
    sector: z.array(z.string()).optional(),
    source: z.array(z.string()).optional(),
    case_status: z.array(z.string()).optional(),
    placement_category: z.array(z.string()).optional(),
    date_range: z.union([
      z.object({ from: z.string(), to: z.string() }),
      z.enum(["current_quarter", "current_year", "all_time"]),
    ]).optional(),
  }).default({}),
  clarification_needed: z.string().optional(),
});

export type PivotQuery = z.infer<typeof PivotQuerySchema>;

/** Maps the NL-query dimension/filter names (per spec §5.1) onto this app's actual pivot dimension keys and filter columns. */
export const DIMENSION_TO_PIVOT_KEY: Record<string, string> = {
  age: "age_bucket", city: "city", sector: "sector", source: "source",
  case_status: "advisor_status", placement_category: "category",
};
