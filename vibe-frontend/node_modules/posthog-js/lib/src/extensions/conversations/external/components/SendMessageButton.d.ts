interface SendMessageButtonProps {
    primaryColor: string;
    inputValue: string;
    isLoading: boolean;
    handleSendMessage: () => void;
}
export declare const SendMessageButton: ({ primaryColor, inputValue, isLoading, handleSendMessage, }: SendMessageButtonProps) => import("preact").JSX.Element;
export {};
