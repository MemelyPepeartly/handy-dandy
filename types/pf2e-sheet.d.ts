
export type SkillAbbreviation = SetElement<typeof SKILL_ABBREVIATIONS>;
export type SkillData = AttributeBasedTraceData;
export type Size = (typeof SIZES)[number];
export type SenseType = SetElement<typeof SENSE_TYPES>;
export type SenseAcuity = (typeof SENSE_ACUITIES)[number];
export type Abilities = Record<AttributeString, AbilityData>;
export type Alignment = SetElement<typeof ALIGNMENTS>;
export type AttributeString = SetElement<typeof ATTRIBUTE_ABBREVIATIONS>;
// expose _modifiers field to allow initialization in data preparation
export type HitPointsStatistic = ActorHitPoints;
/** The full data for creature perception rolls (which behave similarly to skills). */
export type PerceptionData = AttributeBasedTraceData;
export type Rarity = (typeof RARITIES)[number];
export type SaveType = (typeof SAVE_TYPES)[number];

export interface AbilityData {
    /** The modifier for this ability */
    mod: number;
}
/** Basic hitpoints data fields */
export interface BaseHitPointsSource {
    /** The current amount of hitpoints the character has. */
    value: number;
    /** The maximum number of hitpoints this character has. */
    max?: number;
    /** If defined, the amount of temporary hitpoints this character has. */
    temp: number;
    /** Any details about hit points. */
    details: string;
}
export interface ArmorClassTraceData extends StatisticTraceData {
    details: string;
}

/** Basic skill and save data (not including custom modifiers). */
export interface AttributeBasedTraceData extends StatisticTraceData {
    /** The actual modifier for this martial type */
    value: number;
    /** Describes how the value was computed */
    breakdown: string;
    /** The attribute off of which this save scales */
    ability?: AttributeString;
}
/** An strike which a character can use. */
export interface StrikeData {
    slug: string;
    label: string;
    /** The type of action; currently just 'strike'. */
    type: "strike";
    /** The glyph for this strike (how many actions it takes, reaction, etc). */
    glyph: string;
    /** A description of this strike. */
    description: string;
    /** A description of what happens on a critical success. */
    criticalSuccess: string;
    /** A description of what happens on a success. */
    success: string;
    /** Any traits this strike has. */
    traits: TraitViewData[];
    /** Any options always applied to this strike. */
    options: string[];
    /** Whether the strike is ready (usually when the weapon corresponding with the strike is equipped) */
    ready: boolean;
}

export interface SenseData {
    type: SenseType;
    acuity?: SenseAcuity;
    value?: string;
    source?: string;
}

/**
* Data for traits that can be displayed on the UI.
*/
export interface TraitViewData {
    /** The name of this action. */
    name: string;
    /** The label for this action which will be rendered on the UI. */
    label: string;
    /** The roll this trait applies to, if relevant. */
    rollName?: string;
    /** The option that this trait applies to the roll (of type `rollName`). */
    rollOption?: string;
    /** An extra css class added to the UI marker for this trait. */
    cssClass?: string;
    /** The description of the trait */
    description?: string;
}

