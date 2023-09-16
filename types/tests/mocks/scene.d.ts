export declare class MockScene {
    _source: Partial<foundry.documents.SceneSource> & {
        _id: string;
        name: string;
    };
    constructor(data: Partial<foundry.documents.SceneSource>);
    get id(): string;
    get name(): string;
    addToken(token: Partial<foundry.documents.TokenSource>): void;
    update(changes: object): void;
    updateEmbeddedEntity(entityType: string, changes: {
        _id: string;
    }): void;
}
