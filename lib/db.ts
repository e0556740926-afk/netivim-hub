import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
export default sql;

// Generic query helpers
export async function query<T = any>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]> {
  return sql(strings, ...values) as Promise<T[]>;
}
