
export type ActorAlliance = "party" | "opposition" | null;

export interface ActorDetailsSource {
    level?: { value: number };
    alliance?: ActorAlliance;
}
/** Data related to actor hitpoints. */
export interface ActorHitPoints extends Required<BaseHitPointsSource> {
    unrecoverable: number;
    negativeHealing: boolean;
}

export interface ActorHitPointsSource extends ValueAndMaybeMax {
    temp?: number;
}
export interface ActorAttributesSource {
    hp?: ActorHitPointsSource;
    perception?: { value: number };
}
export interface ActorSystemSource {
    details?: ActorDetailsSource;
    attributes: ActorAttributesSource;
    traits?: ActorTraitsSource<string>;
}

export interface ActorTraitsSource<TTrait extends string> {
    /** Actual Pathfinder traits */
    value: TTrait[];
    /** The rarity of the actor (common, uncommon, etc.) */
    rarity?: Rarity;
    /** The actor size (such as 'med'). */
    size?: { value: Size };
}
export interface ActorTraitsData<TTrait extends string> extends ActorTraitsSource<TTrait> {
    rarity: Rarity;
    size: ActorSizePF2e;
}

export interface ActorAttributes extends ActorAttributesSource {
    hp?: ActorHitPoints;
    ac?: { value: number };
    shield?: {
        raised: boolean;
        broken: boolean;
    };
    flanking: {
        /** Whether the actor can flank at all */
        canFlank: boolean;
        /** Whether the actor can be flanked at all */
        flankable: boolean;
    };
}

