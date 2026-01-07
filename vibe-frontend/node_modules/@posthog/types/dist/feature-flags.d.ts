/**
 * Feature flag types
 */
import type { JsonType } from './common';
export type FeatureFlagsCallback = (flags: string[], variants: Record<string, string | boolean>, context?: {
    errorsLoading?: boolean;
}) => void;
export type FeatureFlagDetail = {
    key: string;
    enabled: boolean;
    original_enabled?: boolean | undefined;
    variant: string | undefined;
    original_variant?: string | undefined;
    reason: EvaluationReason | undefined;
    metadata: FeatureFlagMetadata | undefined;
};
export type FeatureFlagMetadata = {
    id: number;
    version: number | undefined;
    description: string | undefined;
    payload: JsonType | undefined;
    original_payload?: JsonType | undefined;
};
export type EvaluationReason = {
    code: string;
    condition_index: number | undefined;
    description: string | undefined;
};
export type RemoteConfigFeatureFlagCallback = (payload: JsonType) => void;
/** A feature that isn't publicly available yet.*/
export interface EarlyAccessFeature {
    name: string;
    description: string;
    stage: 'concept' | 'alpha' | 'beta';
    documentationUrl: string | null;
    payload: JsonType;
    flagKey: string | null;
}
export type EarlyAccessFeatureStage = 'concept' | 'alpha' | 'beta' | 'general-availability';
export type EarlyAccessFeatureCallback = (earlyAccessFeatures: EarlyAccessFeature[]) => void;
export interface EarlyAccessFeatureResponse {
    earlyAccessFeatures: EarlyAccessFeature[];
}
//# sourceMappingURL=feature-flags.d.ts.map