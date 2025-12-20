type UserAction<Context = unknown, R = unknown> = {
    description: string,
    keyboardShortcut: string,
    trigger: (context: Context) => R
}

export const UserActions = {
    SomeActionHere: {
        description: "Do the thing",
        keyboardShortcut: "Cmd+K",
        trigger: (ctx: { userId: string }) => {
            return ctx.userId
        },
    },

    AnotherAction: {
        description: "Another thing",
        keyboardShortcut: "Cmd+Enter",
        trigger: (_ctx: void) => {
            return true
        },
    },
} satisfies Record<string, UserAction<any, any>>