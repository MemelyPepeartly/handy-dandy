import { SKILL_ABBREVIATIONS, SIZES, SENSE_TYPES, SENSE_ACUITIES, ALIGNMENTS, ATTRIBUTE_ABBREVIATIONS, RARITIES, SAVE_TYPES } from "./const";
import { ActorHitPoints } from "./pf2e-actor";
import { AttributeBasedTraceData, StatisticTraceData } from "./pf2e-data";
import { SetElement } from "./util";

type SkillAbbreviation = SetElement<typeof SKILL_ABBREVIATIONS>;
type SkillData = AttributeBasedTraceData;
type Size = (typeof SIZES)[number];
type SenseType = SetElement<typeof SENSE_TYPES>;
type SenseAcuity = (typeof SENSE_ACUITIES)[number];
type Abilities = Record<AttributeString, AbilityData>;
type Alignment = SetElement<typeof ALIGNMENTS>;
type AttributeString = SetElement<typeof ATTRIBUTE_ABBREVIATIONS>;
// expose _modifiers field to allow initialization in data preparation
type HitPointsStatistic = ActorHitPoints;
/** The full data for creature perception rolls (which behave similarly to skills). */
type PerceptionData = AttributeBasedTraceData;
type Rarity = (typeof RARITIES)[number];
type SaveType = (typeof SAVE_TYPES)[number];

interface AbilityData {
    /** The modifier for this ability */
    mod: number;
}
/** Basic hitpoints data fields */
interface BaseHitPointsSource {
    /** The current amount of hitpoints the character has. */
    value: number;
    /** The maximum number of hitpoints this character has. */
    max?: number;
    /** If defined, the amount of temporary hitpoints this character has. */
    temp: number;
    /** Any details about hit points. */
    details: string;
}
interface ArmorClassTraceData extends StatisticTraceData {
    details: string;
}

/** An strike which a character can use. */
interface StrikeData {
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

interface SenseData {
    type: SenseType;
    acuity?: SenseAcuity;
    value?: string;
    source?: string;
}

/**
* Data for traits that can be displayed on the UI.
*/
interface TraitViewData {
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

export {
    SkillAbbreviation,
    SkillData,
    Size,
    SenseType,
    SenseAcuity,
    Abilities,
    Alignment,
    AttributeString,
    HitPointsStatistic,
    PerceptionData,
    Rarity,
    SaveType,
    AbilityData,
    BaseHitPointsSource,
    ArmorClassTraceData,
    StrikeData,
    SenseData,
    TraitViewData
}