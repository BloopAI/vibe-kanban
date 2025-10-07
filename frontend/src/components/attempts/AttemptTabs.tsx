import { NavLink } from 'react-router-dom';

export const AttemptTabs = () => {
  return (
    <div className="flex gap-1">
      <NavLink
        to="../preview"
        relative="path"
        className={({ isActive }) =>
          `px-3 py-1.5 text-sm rounded-md transition-colors ${
            isActive
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`
        }
      >
        Preview
      </NavLink>
      <NavLink
        to="../diffs"
        relative="path"
        className={({ isActive }) =>
          `px-3 py-1.5 text-sm rounded-md transition-colors ${
            isActive
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`
        }
      >
        Diffs
      </NavLink>
    </div>
  );
};
