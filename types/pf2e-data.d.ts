

/** Basic skill and save data (not including custom modifiers). */
export interface AttributeBasedTraceData extends StatisticTraceData {
    /** The actual modifier for this martial type */
    value: number;
    /** Describes how the value was computed */
    breakdown: string;
    /** The attribute off of which this save scales */
    ability?: AttributeString;
}
/** Data intended to be merged back into actor data (usually for token attribute/RE purposes) */
export interface StatisticTraceData extends BaseStatisticTraceData {
    /** Either the totalModifier or the dc depending on what the data is for */
    value: number;
    totalModifier: number;
    dc: number;
}
/**
 * Base data for a statistic that can be traced back to its source.
 */
export interface BaseStatisticTraceData {
    slug: string;
    label: string;
    /** A numeric value of some kind: semantics determined by `AbstractBaseStatistic` subclass */
    value: number;
    breakdown: string;
    modifiers: Required<RawModifier>[];
}
/** The full save data for a character; including its modifiers and other details */
export interface SaveData extends AttributeBasedTraceData {
    saveDetail?: string;
}

export interface ValueAndMaybeMax {
    value: number;
    max?: number;
}

