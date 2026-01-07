import { SubsetParams } from '@electric-sql/client';
import { LoadSubsetOptions } from '@tanstack/db';
export type CompiledSqlRecord = Omit<SubsetParams, `params`> & {
    params?: Array<unknown>;
};
export declare function compileSQL<T>(options: LoadSubsetOptions): SubsetParams;
