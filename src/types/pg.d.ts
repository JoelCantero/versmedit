declare module "pg" {
  export interface QueryResult<Row = unknown> {
    rows: Row[];
  }

  export class Pool {
    constructor(options: { connectionString: string });
    query<Row = unknown>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
    end(): Promise<void>;
  }
}