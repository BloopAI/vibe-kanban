import type { DateLibOptions } from "../classes/DateLib.js";
import type { DayPickerProps, Labels } from "../types/index.js";
/**
 * Merges custom labels from the props with the default labels.
 *
 * When available, uses the locale-provided translation for `labelNext`.
 *
 * @param customLabels The custom labels provided in the DayPicker props.
 * @param options Options from the date library, used to resolve locale
 *   translations.
 * @returns The merged labels object with locale-aware defaults.
 */
export declare function getLabels(customLabels: DayPickerProps["labels"], options: DateLibOptions): Labels;
