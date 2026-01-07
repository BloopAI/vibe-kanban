import React from 'react';
export var DefaultContext = {
  color: undefined,
  size: undefined,
  className: undefined,
  style: undefined,
  attr: undefined
};
export var IconContext = React.createContext && React.createContext(DefaultContext);