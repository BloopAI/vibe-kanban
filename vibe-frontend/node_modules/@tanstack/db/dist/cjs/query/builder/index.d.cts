import { SingleResult } from '../../types.js';
import { OrderByDirection, QueryIR } from '../ir.js';
import { Context, GroupByCallback, JoinOnCallback, MergeContextForJoinCallback, MergeContextWithJoinType, OrderByCallback, OrderByOptions, RefsForContext, ResultTypeFromSelect, SchemaFromSource, SelectObject, Source, WhereCallback, WithResult } from './types.js';
export declare class BaseQueryBuilder<TContext extends Context = Context> {
    private readonly query;
    constructor(query?: Partial<QueryIR>);
    /**
     * Creates a CollectionRef or QueryRef from a source object
     * @param source - An object with a single key-value pair
     * @param context - Context string for error messages (e.g., "from clause", "join clause")
     * @returns A tuple of [alias, ref] where alias is the source key and ref is the created reference
     */
    private _createRefForSource;
    /**
     * Specify the source table or subquery for the query
     *
     * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
     * @returns A QueryBuilder with the specified source
     *
     * @example
     * ```ts
     * // Query from a collection
     * query.from({ users: usersCollection })
     *
     * // Query from a subquery
     * const activeUsers = query.from({ u: usersCollection }).where(({u}) => u.active)
     * query.from({ activeUsers })
     * ```
     */
    from<TSource extends Source>(source: TSource): QueryBuilder<{
        baseSchema: SchemaFromSource<TSource>;
        schema: SchemaFromSource<TSource>;
        fromSourceName: keyof TSource & string;
        hasJoins: false;
    }>;
    /**
     * Join another table or subquery to the current query
     *
     * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
     * @param onCallback - A function that receives table references and returns the join condition
     * @param type - The type of join: 'inner', 'left', 'right', or 'full' (defaults to 'left')
     * @returns A QueryBuilder with the joined table available
     *
     * @example
     * ```ts
     * // Left join users with posts
     * query
     *   .from({ users: usersCollection })
     *   .join({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.userId))
     *
     * // Inner join with explicit type
     * query
     *   .from({ u: usersCollection })
     *   .join({ p: postsCollection }, ({u, p}) => eq(u.id, p.userId), 'inner')
     * ```
     *
     * // Join with a subquery
     * const activeUsers = query.from({ u: usersCollection }).where(({u}) => u.active)
     * query
     *   .from({ activeUsers })
     *   .join({ p: postsCollection }, ({u, p}) => eq(u.id, p.userId))
     */
    join<TSource extends Source, TJoinType extends `inner` | `left` | `right` | `full` = `left`>(source: TSource, onCallback: JoinOnCallback<MergeContextForJoinCallback<TContext, SchemaFromSource<TSource>>>, type?: TJoinType): QueryBuilder<MergeContextWithJoinType<TContext, SchemaFromSource<TSource>, TJoinType>>;
    /**
     * Perform a LEFT JOIN with another table or subquery
     *
     * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
     * @param onCallback - A function that receives table references and returns the join condition
     * @returns A QueryBuilder with the left joined table available
     *
     * @example
     * ```ts
     * // Left join users with posts
     * query
     *   .from({ users: usersCollection })
     *   .leftJoin({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.userId))
     * ```
     */
    leftJoin<TSource extends Source>(source: TSource, onCallback: JoinOnCallback<MergeContextForJoinCallback<TContext, SchemaFromSource<TSource>>>): QueryBuilder<MergeContextWithJoinType<TContext, SchemaFromSource<TSource>, `left`>>;
    /**
     * Perform a RIGHT JOIN with another table or subquery
     *
     * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
     * @param onCallback - A function that receives table references and returns the join condition
     * @returns A QueryBuilder with the right joined table available
     *
     * @example
     * ```ts
     * // Right join users with posts
     * query
     *   .from({ users: usersCollection })
     *   .rightJoin({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.userId))
     * ```
     */
    rightJoin<TSource extends Source>(source: TSource, onCallback: JoinOnCallback<MergeContextForJoinCallback<TContext, SchemaFromSource<TSource>>>): QueryBuilder<MergeContextWithJoinType<TContext, SchemaFromSource<TSource>, `right`>>;
    /**
     * Perform an INNER JOIN with another table or subquery
     *
     * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
     * @param onCallback - A function that receives table references and returns the join condition
     * @returns A QueryBuilder with the inner joined table available
     *
     * @example
     * ```ts
     * // Inner join users with posts
     * query
     *   .from({ users: usersCollection })
     *   .innerJoin({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.userId))
     * ```
     */
    innerJoin<TSource extends Source>(source: TSource, onCallback: JoinOnCallback<MergeContextForJoinCallback<TContext, SchemaFromSource<TSource>>>): QueryBuilder<MergeContextWithJoinType<TContext, SchemaFromSource<TSource>, `inner`>>;
    /**
     * Perform a FULL JOIN with another table or subquery
     *
     * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
     * @param onCallback - A function that receives table references and returns the join condition
     * @returns A QueryBuilder with the full joined table available
     *
     * @example
     * ```ts
     * // Full join users with posts
     * query
     *   .from({ users: usersCollection })
     *   .fullJoin({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.userId))
     * ```
     */
    fullJoin<TSource extends Source>(source: TSource, onCallback: JoinOnCallback<MergeContextForJoinCallback<TContext, SchemaFromSource<TSource>>>): QueryBuilder<MergeContextWithJoinType<TContext, SchemaFromSource<TSource>, `full`>>;
    /**
     * Filter rows based on a condition
     *
     * @param callback - A function that receives table references and returns an expression
     * @returns A QueryBuilder with the where condition applied
     *
     * @example
     * ```ts
     * // Simple condition
     * query
     *   .from({ users: usersCollection })
     *   .where(({users}) => gt(users.age, 18))
     *
     * // Multiple conditions
     * query
     *   .from({ users: usersCollection })
     *   .where(({users}) => and(
     *     gt(users.age, 18),
     *     eq(users.active, true)
     *   ))
     *
     * // Multiple where calls are ANDed together
     * query
     *   .from({ users: usersCollection })
     *   .where(({users}) => gt(users.age, 18))
     *   .where(({users}) => eq(users.active, true))
     * ```
     */
    where(callback: WhereCallback<TContext>): QueryBuilder<TContext>;
    /**
     * Filter grouped rows based on aggregate conditions
     *
     * @param callback - A function that receives table references and returns an expression
     * @returns A QueryBuilder with the having condition applied
     *
     * @example
     * ```ts
     * // Filter groups by count
     * query
     *   .from({ posts: postsCollection })
     *   .groupBy(({posts}) => posts.userId)
     *   .having(({posts}) => gt(count(posts.id), 5))
     *
     * // Filter by average
     * query
     *   .from({ orders: ordersCollection })
     *   .groupBy(({orders}) => orders.customerId)
     *   .having(({orders}) => gt(avg(orders.total), 100))
     *
     * // Multiple having calls are ANDed together
     * query
     *   .from({ orders: ordersCollection })
     *   .groupBy(({orders}) => orders.customerId)
     *   .having(({orders}) => gt(count(orders.id), 5))
     *   .having(({orders}) => gt(avg(orders.total), 100))
     * ```
     */
    having(callback: WhereCallback<TContext>): QueryBuilder<TContext>;
    /**
     * Select specific columns or computed values from the query
     *
     * @param callback - A function that receives table references and returns an object with selected fields or expressions
     * @returns A QueryBuilder that returns only the selected fields
     *
     * @example
     * ```ts
     * // Select specific columns
     * query
     *   .from({ users: usersCollection })
     *   .select(({users}) => ({
     *     name: users.name,
     *     email: users.email
     *   }))
     *
     * // Select with computed values
     * query
     *   .from({ users: usersCollection })
     *   .select(({users}) => ({
     *     fullName: concat(users.firstName, ' ', users.lastName),
     *     ageInMonths: mul(users.age, 12)
     *   }))
     *
     * // Select with aggregates (requires GROUP BY)
     * query
     *   .from({ posts: postsCollection })
     *   .groupBy(({posts}) => posts.userId)
     *   .select(({posts, count}) => ({
     *     userId: posts.userId,
     *     postCount: count(posts.id)
     *   }))
     * ```
     */
    select<TSelectObject extends SelectObject>(callback: (refs: RefsForContext<TContext>) => TSelectObject): QueryBuilder<WithResult<TContext, ResultTypeFromSelect<TSelectObject>>>;
    /**
     * Sort the query results by one or more columns
     *
     * @param callback - A function that receives table references and returns the field to sort by
     * @param direction - Sort direction: 'asc' for ascending, 'desc' for descending (defaults to 'asc')
     * @returns A QueryBuilder with the ordering applied
     *
     * @example
     * ```ts
     * // Sort by a single column
     * query
     *   .from({ users: usersCollection })
     *   .orderBy(({users}) => users.name)
     *
     * // Sort descending
     * query
     *   .from({ users: usersCollection })
     *   .orderBy(({users}) => users.createdAt, 'desc')
     *
     * // Multiple sorts (chain orderBy calls)
     * query
     *   .from({ users: usersCollection })
     *   .orderBy(({users}) => users.lastName)
     *   .orderBy(({users}) => users.firstName)
     * ```
     */
    orderBy(callback: OrderByCallback<TContext>, options?: OrderByDirection | OrderByOptions): QueryBuilder<TContext>;
    /**
     * Group rows by one or more columns for aggregation
     *
     * @param callback - A function that receives table references and returns the field(s) to group by
     * @returns A QueryBuilder with grouping applied (enables aggregate functions in SELECT and HAVING)
     *
     * @example
     * ```ts
     * // Group by a single column
     * query
     *   .from({ posts: postsCollection })
     *   .groupBy(({posts}) => posts.userId)
     *   .select(({posts, count}) => ({
     *     userId: posts.userId,
     *     postCount: count()
     *   }))
     *
     * // Group by multiple columns
     * query
     *   .from({ sales: salesCollection })
     *   .groupBy(({sales}) => [sales.region, sales.category])
     *   .select(({sales, sum}) => ({
     *     region: sales.region,
     *     category: sales.category,
     *     totalSales: sum(sales.amount)
     *   }))
     * ```
     */
    groupBy(callback: GroupByCallback<TContext>): QueryBuilder<TContext>;
    /**
     * Limit the number of rows returned by the query
     * `orderBy` is required for `limit`
     *
     * @param count - Maximum number of rows to return
     * @returns A QueryBuilder with the limit applied
     *
     * @example
     * ```ts
     * // Get top 5 posts by likes
     * query
     *   .from({ posts: postsCollection })
     *   .orderBy(({posts}) => posts.likes, 'desc')
     *   .limit(5)
     * ```
     */
    limit(count: number): QueryBuilder<TContext>;
    /**
     * Skip a number of rows before returning results
     * `orderBy` is required for `offset`
     *
     * @param count - Number of rows to skip
     * @returns A QueryBuilder with the offset applied
     *
     * @example
     * ```ts
     * // Get second page of results
     * query
     *   .from({ posts: postsCollection })
     *   .orderBy(({posts}) => posts.createdAt, 'desc')
     *   .offset(page * pageSize)
     *   .limit(pageSize)
     * ```
     */
    offset(count: number): QueryBuilder<TContext>;
    /**
     * Specify that the query should return distinct rows.
     * Deduplicates rows based on the selected columns.
     * @returns A QueryBuilder with distinct enabled
     *
     * @example
     * ```ts
     * // Get countries our users are from
     * query
     *   .from({ users: usersCollection })
     *   .select(({users}) => users.country)
     *   .distinct()
     * ```
     */
    distinct(): QueryBuilder<TContext>;
    /**
     * Specify that the query should return a single result
     * @returns A QueryBuilder that returns the first result
     *
     * @example
     * ```ts
     * // Get the user matching the query
     * query
     *   .from({ users: usersCollection })
     *   .where(({users}) => eq(users.id, 1))
     *   .findOne()
     *```
     */
    findOne(): QueryBuilder<TContext & SingleResult>;
    private _getCurrentAliases;
    /**
     * Functional variants of the query builder
     * These are imperative function that are called for ery row.
     * Warning: that these cannot be optimized by the query compiler, and may prevent
     * some type of optimizations being possible.
     * @example
     * ```ts
     * q.fn.select((row) => ({
     *   name: row.user.name.toUpperCase(),
     *   age: row.user.age + 1,
     * }))
     * ```
     */
    get fn(): {
        /**
         * Select fields using a function that operates on each row
         * Warning: This cannot be optimized by the query compiler
         *
         * @param callback - A function that receives a row and returns the selected value
         * @returns A QueryBuilder with functional selection applied
         *
         * @example
         * ```ts
         * // Functional select (not optimized)
         * query
         *   .from({ users: usersCollection })
         *   .fn.select(row => ({
         *     name: row.users.name.toUpperCase(),
         *     age: row.users.age + 1,
         *   }))
         * ```
         */
        select<TFuncSelectResult>(callback: (row: TContext[`schema`]) => TFuncSelectResult): QueryBuilder<WithResult<TContext, TFuncSelectResult>>;
        /**
         * Filter rows using a function that operates on each row
         * Warning: This cannot be optimized by the query compiler
         *
         * @param callback - A function that receives a row and returns a boolean
         * @returns A QueryBuilder with functional filtering applied
         *
         * @example
         * ```ts
         * // Functional where (not optimized)
         * query
         *   .from({ users: usersCollection })
         *   .fn.where(row => row.users.name.startsWith('A'))
         * ```
         */
        where(callback: (row: TContext[`schema`]) => any): QueryBuilder<TContext>;
        /**
         * Filter grouped rows using a function that operates on each aggregated row
         * Warning: This cannot be optimized by the query compiler
         *
         * @param callback - A function that receives an aggregated row and returns a boolean
         * @returns A QueryBuilder with functional having filter applied
         *
         * @example
         * ```ts
         * // Functional having (not optimized)
         * query
         *   .from({ posts: postsCollection })
         *   .groupBy(({posts}) => posts.userId)
         *   .fn.having(row => row.count > 5)
         * ```
         */
        having(callback: (row: TContext[`schema`]) => any): QueryBuilder<TContext>;
    };
    _getQuery(): QueryIR;
}
export declare function buildQuery<TContext extends Context>(fn: (builder: InitialQueryBuilder) => QueryBuilder<TContext>): QueryIR;
export declare function getQueryIR(builder: BaseQueryBuilder | QueryBuilder<any> | InitialQueryBuilder): QueryIR;
export type InitialQueryBuilder = Pick<BaseQueryBuilder<Context>, `from`>;
export type InitialQueryBuilderConstructor = new () => InitialQueryBuilder;
export type QueryBuilder<TContext extends Context> = Omit<BaseQueryBuilder<TContext>, `from` | `_getQuery`>;
export declare const Query: InitialQueryBuilderConstructor;
export type ExtractContext<T> = T extends BaseQueryBuilder<infer TContext> ? TContext : T extends QueryBuilder<infer TContext> ? TContext : never;
export type { Context, Source, GetResult, RefLeaf as Ref, InferResultType, } from './types.js';
