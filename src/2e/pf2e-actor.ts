import { ValueAndMaybeMax } from "./pf2e-data";
import { Abilities, BaseHitPointsSource, Rarity, Size, StrikeData } from "./pf2e-sheet";

type ActorAlliance = "party" | "opposition" | null;

interface ActorDetailsSource {
    level?: { value: number };
    alliance?: ActorAlliance;
}
/** Data related to actor hitpoints. */
interface ActorHitPoints extends Required<BaseHitPointsSource> {
    unrecoverable: number;
    negativeHealing: boolean;
}

interface ActorHitPointsSource extends ValueAndMaybeMax {
    temp?: number;
}
interface ActorAttributesSource {
    hp?: ActorHitPointsSource;
    perception?: { value: number };
}
interface ActorSystemSource {
    details?: ActorDetailsSource;
    attributes: ActorAttributesSource;
    traits?: ActorTraitsSource<string>;

    /** A record of this actor's current world schema version as well a log of the last migration to occur */
    _migration: any;
    /** Legacy location of `MigrationRecord` */
    schema?: Readonly<{ version: number | null; lastMigration: object | null }>;
}

interface ActorTraitsSource<TTrait extends string> {
    /** Actual Pathfinder traits */
    value: TTrait[];
    /** The rarity of the actor (common, uncommon, etc.) */
    rarity?: Rarity;
    /** The actor size (such as 'med'). */
    size?: { value: Size };
}
interface ActorTraitsData<TTrait extends string> extends ActorTraitsSource<TTrait> {
    rarity: Rarity;
    size: any;
}

interface ActorAttributes extends ActorAttributesSource {
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

interface ActorSystemData extends ActorSystemSource {
    abilities?: Abilities;
    details: ActorDetails;
    actions?: StrikeData[];
    attributes: ActorAttributes;
    traits?: ActorTraitsData<string>;
}

interface ActorDetails extends ActorDetailsSource {
    level: { value: number };
    alliance: ActorAlliance;
}

export {
    ActorAlliance,
    ActorDetailsSource,
    ActorHitPointsSource,
    ActorSystemSource,
    ActorTraitsSource,
    ActorTraitsData,
    ActorAttributesSource,
    ActorAttributes,
    ActorSystemData,
    ActorDetails,
    ActorHitPoints
}
