
export type CreatureSaves = Record<SaveType, SaveData>;
export type CreatureDetailsSource = ActorDetailsSource;
export interface CreatureSystemData extends Omit<CreatureSystemSource, "attributes">, ActorSystemData {
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
export interface CreatureAttributes extends ActorAttributes {
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
export interface CreatureSystemSource extends ActorSystemSource {
    details?: CreatureDetailsSource;

    /** Traits, languages, and other information. */
    traits?: CreatureTraitsSource;

    /** Saving throw data */
    saves?: Record<SaveType, object | undefined>;

    resources?: CreatureResourcesSource;
}

export interface CreatureResources extends CreatureResourcesSource {
    /** The current number of focus points and pool size */
    focus: {
        value: number;
        max: number;
        cap: number;
    };
}

export interface CreatureResourcesSource {
    focus?: {
        value: number;
        max?: number;
    };
}
export interface CreatureTraitsSource extends ActorTraitsSource {
    /** Languages which this actor knows and can speak. */
    languages: ValuesList<Language>;

    senses?: { value: string } | SenseData[];
}
export type CreatureDetails = {
    /** The alignment this creature has */
    alignment: { value: Alignment };
    /** The alliance this NPC belongs to: relevant to mechanics like flanking */
    alliance: ActorAlliance;
    /** The creature level for this actor */
    level: { value: number };
};
export interface CreatureTraitsData extends ActorTraitsData, Omit<CreatureTraitsSource, "rarity" | "size"> {
    senses?: { value: string } | CreatureSensePF2e[];
    /** Languages which this actor knows and can speak. */
    languages: ValuesList<Language>;
}


