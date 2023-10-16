import { AttributeString } from "./pf2e-sheet";


/** Basic skill and save data (not including custom modifiers). */
interface AttributeBasedTraceData extends StatisticTraceData {
    /** The actual modifier for this martial type */
    value: number;
    /** Describes how the value was computed */
    breakdown: string;
    /** The attribute off of which this save scales */
    ability?: AttributeString;
}
/** Data intended to be merged back into actor data (usually for token attribute/RE purposes) */
interface StatisticTraceData extends BaseStatisticTraceData {
    /** Either the totalModifier or the dc depending on what the data is for */
    value: number;
    totalModifier: number;
    dc: number;
}
interface BaseRawModifier {
    /** An identifier for this modifier; should generally be a localization key (see en.json). */
    slug?: string;
    /** The display name of this modifier; can be a localization key (see en.json). */
    label: string;
    /** The actual numeric benefit/penalty that this modifier provides. */
    modifier?: number;
    /** The type of this modifier - modifiers of the same type do not stack (except for `untyped` modifiers). */
    type?: any;
    /** If the type is "ability", this should be set to a particular ability */
    ability?: AttributeString | null;
    /** Numeric adjustments to apply */
    adjustments?: any[];
    /** If true, this modifier will be applied to the final roll; if false, it will be ignored. */
    enabled?: boolean;
    /** If true, these custom dice are being ignored in the damage calculation. */
    ignored?: boolean;
    /** The source from which this modifier originates, if any. */
    source?: string | null;
    /** If true, this modifier is a custom player-provided modifier. */
    custom?: boolean;
    /** The damage type that this modifier does, if it modifies a damage roll. */
    damageType?: any | null;
    /** The damage category */
    damageCategory?: any | null;
    /** A predicate which determines when this modifier is active. */
    predicate?: any;
    /** If true, this modifier is only active on a critical hit. */
    critical?: boolean | null;
    /** Any notes about this modifier. */
    notes?: string;
    /** The list of traits that this modifier gives to the underlying attack, if any. */
    traits?: string[];
    /** Hide this modifier in UIs if it is disabled */
    hideIfDisabled?: boolean;
}
interface RawModifier extends BaseRawModifier {
    modifier: number;
    /** Whether to use this bonus/penalty/modifier even if it isn't the greatest magnitude */
    force?: boolean;
}

/**
 * Base data for a statistic that can be traced back to its source.
 */
interface BaseStatisticTraceData {
    slug: string;
    label: string;
    /** A numeric value of some kind: semantics determined by `AbstractBaseStatistic` subclass */
    value: number;
    breakdown: string;
    modifiers: Required<RawModifier>[];
}
/** The full save data for a character; including its modifiers and other details */
interface SaveData extends AttributeBasedTraceData {
    saveDetail?: string;
}

interface ValueAndMaybeMax {
    value: number;
    max?: number;
}

export {
    AttributeBasedTraceData,
    BaseStatisticTraceData,
    SaveData,
    StatisticTraceData,
    ValueAndMaybeMax
}

