import { ActorDetailsSource, ActorAttributes, ActorHitPoints, ActorSystemSource, ActorTraitsSource, ActorAlliance, ActorTraitsData, ActorSystemData } from "./pf2e-actor";
import { SaveData } from "./pf2e-data";
import { SaveType, Abilities, SkillAbbreviation, SkillData, StrikeData, SenseData, Alignment } from "./pf2e-sheet";

type CreatureSaves = Record<SaveType, SaveData>;
type CreatureDetailsSource = ActorDetailsSource;
interface CreatureSystemData extends Omit<CreatureSystemSource, "attributes">, ActorSystemData {
    abilities?: Abilities;

    details: CreatureDetails;

    /** Traits, languages, and other information. */
    traits: CreatureTraitsData;

    attributes: CreatureAttributes;

    /** Saving throw data */
    saves: CreatureSaves;

    skills: Record<SkillAbbreviation, SkillData>;

    actions?: StrikeData[];
    resources?: CreatureResources;
}

/** Miscallenous but mechanically relevant creature attributes.  */
interface CreatureAttributes extends ActorAttributes {
    hp: ActorHitPoints;
    ac: { value: number };
    /** The creature's natural reach */
    reach: {
        /** The default reach for all actions requiring one */
        base: number;
        /** Its reach for the purpose of manipulate actions, usually the same as its base reach */
        manipulate: number;
    };

    /** Whether this creature emits sound */
    emitsSound: boolean;
}

interface CreatureSystemSource extends ActorSystemSource {
    details?: CreatureDetailsSource;

    /** Traits, languages, and other information. */
    traits?: CreatureTraitsSource;

    /** Maps roll types -> a list of modifiers which should affect that roll type. */
    customModifiers?: Record<string, any[]>;

    /** Saving throw data */
    saves?: Record<SaveType, object | undefined>;

    resources?: CreatureResourcesSource;
}

interface CreatureResources extends CreatureResourcesSource {
    /** The current number of focus points and pool size */
    focus: {
        value: number;
        max: number;
        cap: number;
    };
}

interface CreatureResourcesSource {
    focus?: {
        value: number;
        max?: number;
    };
}
interface CreatureTraitsSource extends ActorTraitsSource<any> {
    /** Languages which this actor knows and can speak. */
    languages: any;

    senses?: { value: string } | SenseData[];
}
type CreatureDetails = {
    /** The alignment this creature has */
    alignment: { value: Alignment };
    /** The alliance this NPC belongs to: relevant to mechanics like flanking */
    alliance: ActorAlliance;
    /** The creature level for this actor */
    level: { value: number };
};
interface CreatureTraitsData extends ActorTraitsData<any>, Omit<CreatureTraitsSource, "rarity" | "size"> {
    senses?: { value: string } | any[];
    /** Languages which this actor knows and can speak. */
    languages: any;
}

export {
    CreatureSaves,
    CreatureDetailsSource,
    CreatureSystemData,
    CreatureAttributes,
    CreatureSystemSource,
    CreatureResources,
    CreatureResourcesSource,
    CreatureTraitsSource,
    CreatureTraitsData,
    CreatureDetails
}