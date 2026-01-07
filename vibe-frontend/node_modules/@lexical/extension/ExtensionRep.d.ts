/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalBuilder } from './LexicalBuilder';
import type { AnyLexicalExtension, ExtensionBuildState, ExtensionInitState, ExtensionRegisterState, InitialEditorConfig, LexicalEditor, LexicalExtensionConfig, LexicalExtensionDependency, LexicalExtensionInit, LexicalExtensionOutput } from 'lexical';
export declare const ExtensionRepStateIds: {
    readonly unmarked: 0;
    readonly temporary: 1;
    readonly permanent: 2;
    readonly configured: 3;
    readonly initialized: 4;
    readonly built: 5;
    readonly registered: 6;
    readonly afterRegistration: 7;
};
interface UnmarkedState {
    id: (typeof ExtensionRepStateIds)['unmarked'];
}
interface TemporaryState {
    id: (typeof ExtensionRepStateIds)['temporary'];
}
interface PermanentState {
    id: (typeof ExtensionRepStateIds)['permanent'];
}
interface ConfiguredState<Extension extends AnyLexicalExtension> {
    id: (typeof ExtensionRepStateIds)['configured'];
    config: LexicalExtensionConfig<Extension>;
    registerState: ExtensionInitState;
}
interface InitializedState<Extension extends AnyLexicalExtension> extends Omit<ConfiguredState<Extension>, 'id' | 'registerState'> {
    id: (typeof ExtensionRepStateIds)['initialized'];
    initResult: LexicalExtensionInit<Extension>;
    registerState: ExtensionBuildState<LexicalExtensionInit<Extension>>;
}
interface BuiltState<Extension extends AnyLexicalExtension> extends Omit<ConfiguredState<Extension>, 'id' | 'registerState'> {
    id: (typeof ExtensionRepStateIds)['built'];
    initResult: LexicalExtensionInit<Extension>;
    output: LexicalExtensionOutput<Extension>;
    registerState: ExtensionRegisterState<LexicalExtensionInit<Extension>, LexicalExtensionOutput<Extension>>;
}
interface RegisteredState<Extension extends AnyLexicalExtension> extends Omit<BuiltState<Extension>, 'id'> {
    id: (typeof ExtensionRepStateIds)['registered'];
}
interface AfterRegistrationState<Extension extends AnyLexicalExtension> extends Omit<RegisteredState<Extension>, 'id'> {
    id: (typeof ExtensionRepStateIds)['afterRegistration'];
}
export type ExtensionRepState<Extension extends AnyLexicalExtension> = UnmarkedState | TemporaryState | PermanentState | ConfiguredState<Extension> | InitializedState<Extension> | BuiltState<Extension> | RegisteredState<Extension> | AfterRegistrationState<Extension>;
export declare function isExactlyUnmarkedExtensionRepState<Extension extends AnyLexicalExtension>(state: ExtensionRepState<Extension>): state is UnmarkedState;
export declare function isExactlyPermanentExtensionRepState<Extension extends AnyLexicalExtension>(state: ExtensionRepState<Extension>): state is PermanentState;
export declare function applyTemporaryMark<Extension extends AnyLexicalExtension>(state: ExtensionRepState<Extension>): TemporaryState;
export declare function applyPermanentMark<Extension extends AnyLexicalExtension>(state: ExtensionRepState<Extension>): PermanentState;
export declare function applyConfiguredState<Extension extends AnyLexicalExtension>(state: PermanentState, config: LexicalExtensionConfig<Extension>, registerState: ExtensionInitState): ConfiguredState<Extension>;
export declare function applyInitializedState<Extension extends AnyLexicalExtension>(state: ConfiguredState<Extension>, initResult: LexicalExtensionInit<Extension>, registerState: ExtensionBuildState<LexicalExtensionInit<Extension>>): InitializedState<Extension>;
export declare function applyBuiltState<Extension extends AnyLexicalExtension>(state: InitializedState<Extension>, output: LexicalExtensionOutput<Extension>, registerState: ExtensionRegisterState<LexicalExtensionInit<Extension>, LexicalExtensionOutput<Extension>>): BuiltState<Extension>;
export declare function applyRegisteredState<Extension extends AnyLexicalExtension>(state: BuiltState<Extension>): never;
export declare function applyAfterRegistrationState<Extension extends AnyLexicalExtension>(state: RegisteredState<Extension>): AfterRegistrationState<Extension>;
export declare function rollbackToBuiltState<Extension extends AnyLexicalExtension>(state: AfterRegistrationState<Extension>): BuiltState<Extension>;
/**
 * @internal
 */
export declare class ExtensionRep<Extension extends AnyLexicalExtension> {
    builder: LexicalBuilder;
    configs: Set<Partial<LexicalExtensionConfig<Extension>>>;
    _dependency?: LexicalExtensionDependency<Extension>;
    _peerNameSet?: Set<string>;
    extension: Extension;
    state: ExtensionRepState<Extension>;
    _signal?: AbortSignal;
    constructor(builder: LexicalBuilder, extension: Extension);
    mergeConfigs(): LexicalExtensionConfig<Extension>;
    init(editorConfig: InitialEditorConfig): void;
    build(editor: LexicalEditor): void;
    register(editor: LexicalEditor, signal: AbortSignal): undefined | (() => void);
    afterRegistration(editor: LexicalEditor): undefined | (() => void);
    getSignal(): AbortSignal;
    getInitResult(): LexicalExtensionInit<Extension>;
    getInitPeer<PeerExtension extends AnyLexicalExtension = never>(name: PeerExtension['name']): undefined | Omit<LexicalExtensionDependency<PeerExtension>, 'output' | 'init'>;
    getExtensionInitDependency(): Omit<LexicalExtensionDependency<Extension>, 'output' | 'init'>;
    getPeer<PeerExtension extends AnyLexicalExtension = never>(name: PeerExtension['name']): undefined | LexicalExtensionDependency<PeerExtension>;
    getInitDependency<Dependency extends AnyLexicalExtension>(dep: Dependency): Omit<LexicalExtensionDependency<Dependency>, 'output' | 'init'>;
    getDependency<Dependency extends AnyLexicalExtension>(dep: Dependency): LexicalExtensionDependency<Dependency>;
    getState(): AfterRegistrationState<Extension>;
    getDirectDependentNames(): ReadonlySet<string>;
    getPeerNameSet(): ReadonlySet<string>;
    getExtensionDependency(): LexicalExtensionDependency<Extension>;
}
export {};
