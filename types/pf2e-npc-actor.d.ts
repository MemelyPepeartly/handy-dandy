
// The three saves for NPCs.
export interface NPCSaves {
    fortitude: NPCSaveData;
    reflex: NPCSaveData;
    will: NPCSaveData;
}
export interface NPCSaveData extends SaveData {
    ability: AttributeString;
    base?: number;
    saveDetail: string;
}

// Details about this actor, such as alignment or ancestry.
export interface NPCDetails extends NPCDetailsSource, CreatureDetails {
    level: {
        value: number;
        /** The presence of a `base` that is different from the `value` indicates the level was adjusted. */
        base: number;
    };

    alliance: ActorAlliance;
}

export interface NPCDetailsSource extends CreatureDetailsSource {
    level: {
        value: number;
    };

    /** Which sourcebook this creature comes from. */
    source: {
        value: string;
        author: string;
    };

    /** The type of this creature (such as 'undead') */
    creatureType: string;
    /** A very brief description */
    blurb: string;
    /** The in depth descripton and any other public notes */
    publicNotes: string;
    /** The private GM notes */
    privateNotes: string;
}


export interface NPCAttributes
    extends Omit<NPCAttributesSource, "initiative" | "immunities" | "weaknesses" | "resistances">,
    CreatureAttributes {
    ac: ArmorClassTraceData;
    adjustment: "elite" | "weak" | null;
    hp: NPCHitPoints;

    // perception: NPCPerception;
    // initiative: InitiativeTraceData;
    // speed: NPCSpeeds;

    /** Textual information about any special benefits that apply to all saves. */
    allSaves: { value: string };
    /** A fake class DC (set to a level-based DC) for use with critical specialization effects that require it */
    classDC: { value: number };
    /** The best spell DC */
    spellDC: { value: number } | null;
    /** And a fake class-or-spell DC to go along with it */
    classOrSpellDC: { value: number };
}
export interface NPCHitPoints extends HitPointsStatistic {
    base?: number;
}

/** Perception data with an additional "base" value */
export interface NPCPerception extends PerceptionData {
    rank?: number;
}

/** Skill data with a "base" value and whether the skill should be rendered (visible) */
export interface NPCSkillData extends StatisticTraceData {
    base?: number;
    visible?: boolean;
    isLore?: boolean;
    itemID?: string;
    ability: AttributeString;
    variants: { label: string; options: string }[];
}

/** The full data for a NPC action (used primarily for strikes.) */
export interface NPCStrike extends StrikeData {
    item: MeleePF2e<ActorPF2e>;
    /** The type of attack as a localization string */
    attackRollType?: string;
    /** The id of the item this strike is generated from */
    sourceId?: string;
    /** Additional effects from a successful strike, like "Grab" */
    additionalEffects: { tag: string; label: string }[];
    /** A melee usage of a firearm: not available on NPC strikes */
    altUsages?: never;
}

export interface NPCTraitsSource extends CreatureTraitsSource {
    /** A description of special senses this NPC has */
    senses: { value: string };
    rarity: Rarity;
    size: { value: Size };
}
export interface NPCTraitsData extends Omit<CreatureTraitsData, "senses">, NPCTraitsSource {
    rarity: Rarity;
}

export interface NPCSystemSource extends CreatureSystemSource {
    traits: NPCTraitsSource;

    /** The six primary ability scores. */
    abilities: Abilities;

    /** Any special attributes for this NPC, such as AC or health. */
    attributes: NPCAttributesSource;

    /** Details about this actor, such as alignment or ancestry. */
    details: NPCDetailsSource;

    /** The three saves for NPCs. NPC saves have a 'base' score which is the score before applying custom modifiers. */
    saves: NPCSavesSource;

    /** Spellcasting data: currently only used for rituals */
    spellcasting?: {
        rituals?: {
            dc: number;
        };
    };

    resources: CreatureResourcesSource;
}

export interface NPCSystemData extends Omit<NPCSystemSource, "attributes">, CreatureSystemData {
    abilities: Abilities;
    saves: NPCSaves;
    details: NPCDetails;
    attributes: NPCAttributes;
    skills: Record<string, NPCSkillData>;
    actions: NPCStrike[];
    traits: NPCTraitsData;
    resources: CreatureResources;
    spellcasting: {
        rituals: { dc: number };
    };
}
