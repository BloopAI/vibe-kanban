import { Session, SessionAggregates } from '../types-hoist/session';
import { User } from '../types-hoist/user';
/**
 * @internal
 */
export declare function addAutoIpAddressToUser(objWithMaybeUser: {
    user?: User | null;
}): void;
/**
 * @internal
 */
export declare function addAutoIpAddressToSession(session: Session | SessionAggregates): void;
//# sourceMappingURL=ipAddress.d.ts.map
