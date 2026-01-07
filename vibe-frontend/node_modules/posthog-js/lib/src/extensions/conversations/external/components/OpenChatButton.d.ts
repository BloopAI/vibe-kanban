interface OpenChatButtonProps {
    primaryColor: string;
    handleToggleOpen: () => void;
    unreadCount?: number;
}
export declare const OpenChatButton: ({ primaryColor, handleToggleOpen, unreadCount }: OpenChatButtonProps) => import("preact").JSX.Element;
export {};
