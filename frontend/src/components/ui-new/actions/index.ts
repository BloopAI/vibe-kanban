type UserAction = {
  description: string;
  keyboardShortcut: string;
};

const defineActions = <T extends Record<string, UserAction>>(t: T) => t;

export const UserActions = defineActions({
  SomeActionHere: {
    description: 'Do the thing',
    keyboardShortcut: 'Cmd+K',
  },

  AnotherAction: {
    description: 'Another thing',
    keyboardShortcut: 'Cmd+Enter',
  },
});
