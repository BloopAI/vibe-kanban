import { h, Component } from 'preact';
import { ConversationsRemoteConfig, Message, ConversationsWidgetState, UserProvidedTraits } from '../../../../posthog-conversations-types';
interface WidgetProps {
    config: ConversationsRemoteConfig;
    initialState?: ConversationsWidgetState;
    initialUserTraits?: UserProvidedTraits | null;
    onSendMessage: (message: string) => Promise<void>;
    onStateChange?: (state: ConversationsWidgetState) => void;
    onIdentify?: (traits: UserProvidedTraits) => void;
}
interface WidgetState {
    state: ConversationsWidgetState;
    messages: Message[];
    inputValue: string;
    isLoading: boolean;
    error: string | null;
    showIdentificationForm: boolean;
    formName: string;
    formEmail: string;
    formEmailError: string | null;
    userTraits: UserProvidedTraits | null;
    unreadCount: number;
}
export declare class ConversationsWidget extends Component<WidgetProps, WidgetState> {
    private _messagesEndRef;
    private _inputRef;
    constructor(props: WidgetProps);
    /**
     * Check if we need to show the identification form
     */
    private _needsIdentification;
    componentDidMount(): void;
    componentDidUpdate(_prevProps: WidgetProps, prevState: WidgetState): void;
    private _addGreetingMessage;
    private _scrollToBottom;
    private _focusInput;
    private _handleToggleOpen;
    private _handleClose;
    private _handleInputChange;
    private _handleKeyPress;
    private _handleFormNameChange;
    private _handleFormEmailChange;
    private _validateEmail;
    private _handleFormSubmit;
    private _handleSendMessage;
    private _formatTime;
    /**
     * Public method to add messages from outside
     */
    addMessages(messages: Message[]): void;
    /**
     * Public method to show the widget
     */
    show(): void;
    /**
     * Public method to hide the widget
     */
    hide(): void;
    /**
     * Public method to close the widget completely
     */
    close(): void;
    /**
     * Get user traits (either provided via form or from props)
     */
    getUserTraits(): UserProvidedTraits | null;
    /**
     * Set the unread message count (called by manager)
     */
    setUnreadCount(count: number): void;
    private _renderIdentificationForm;
    private _renderMessage;
    render(): h.JSX.Element;
}
export {};
