import React, { useEffect, useRef } from 'react';
import { render, screen, fireEvent, waitForElementToBeRemoved, act } from '@testing-library/react';
import NiceModal, {
  useModal,
  Provider,
  ModalDef,
  register,
  create,
  antdDrawer,
  antdDrawerV5,
  antdModal,
  antdModalV5,
  muiDialog,
  muiDialogV5,
  bootstrapDialog,
  reducer,
} from './index';

const delay = (t) => new Promise((resolve) => setTimeout(resolve, t));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  componentDidCatch(error, info) {
    this.setState({ hasError: true, error, info });
  }

  renderDefaultError() {
    return <div>Something went wrong.</div>;
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <div className="common-error-boundary">{this.renderDefaultError()}</div>;
    }
    return this.props.children; // eslint-disable-line
  }
}

test('throw error if no provider', async () => {
  render(<div />);

  let err;
  act(() => {
    try {
      NiceModal.show('test-modal-without-provider');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
  });
});

const TestModal = ({ visible = false, onExited, onClose, onCancel, children }) => {
  const lastVisibleRef = useRef(visible);
  const lastVisible = lastVisibleRef.current;
  useEffect(() => {
    if (!visible && lastVisible) {
      setTimeout(onExited, 30);
    }
  }, [visible, onExited, lastVisible]);

  lastVisibleRef.current = visible;
  return (
    <div>
      TestModal {visible} <div>{children}</div>
      <p>
        <button onClick={onClose}>Close</button>
      </p>
      <p>
        <button onClick={onCancel}>Cancel</button>
      </p>
    </div>
  );
};

const HocTestModal = create(({ name = 'nate' }) => {
  const modal = useModal();
  const remove = () => modal.remove();

  return (
    <TestModal visible={modal.visible} onExited={remove} onClose={remove}>
      <label>{name}</label>
      <div>HocTestModal</div>
    </TestModal>
  );
});

test('provider children is correctly rendered', () => {
  render(
    <Provider>
      <span>learn nice modal</span>
    </Provider>,
  );
  const childText = screen.getByText(/learn nice modal/i);
  expect(childText).toBeInTheDocument();
});

const testUseModal = async (modal, props = {}) => {
  let modalTextElement = screen.queryByText('HocTestModal');
  expect(modalTextElement).not.toBeInTheDocument();

  const resolved = [];
  let rejected = null;

  act(() => {
    modal.show(props).then((res = true) => resolved.push(res));
  });

  act(() => {
    modal.show(props).then((res = true) => resolved.push(res));
  });
  modalTextElement = screen.queryByText('HocTestModal');
  expect(modalTextElement).toBeInTheDocument();

  modalTextElement = screen.queryByText('bood');
  expect(modalTextElement).toBeInTheDocument();

  act(() => {
    modal.resolve({ resolved: true });
    modal.hide();
  });

  modalTextElement = screen.queryByText('HocTestModal');
  expect(modalTextElement).toBeInTheDocument();

  await waitForElementToBeRemoved(screen.queryByText('HocTestModal'));

  expect(resolved).toEqual([{ resolved: true }, { resolved: true }]);
  expect(rejected).toBe(null);

  act(() => {
    modal.show().catch((err) => {
      rejected = err;
    });
  });

  act(() => {
    modal.reject(new Error('sample error'));
    modal.hide();
  });

  await waitForElementToBeRemoved(screen.queryByText('HocTestModal'));
  expect(rejected && rejected.message).toBe('sample error');
};

test('useModal by id of registered modal', async () => {
  const hocTestModalId = 'hoc-test-modal';
  register(hocTestModalId, HocTestModal, { name: 'bood' });
  let modal;
  const App = () => {
    modal = useModal(hocTestModalId);
    return <Provider />;
  };
  render(<App />);
  await testUseModal(modal);
});

test('useModal by id of declared modal via JSX', async () => {
  let modal;
  const App = () => {
    modal = useModal('mytestmodal');
    return (
      <Provider>
        <HocTestModal id="mytestmodal" name="bood" />
      </Provider>
    );
  };
  render(<App />);
  await testUseModal(modal);
});

test('useModal by id of declared modal via ModalDef', async () => {
  let modal;
  const App = () => {
    modal = useModal('mytestmodal2');
    return (
      <Provider>
        <ModalDef id="mytestmodal2" component={HocTestModal} />
      </Provider>
    );
  };
  render(<App />);
  await testUseModal(modal, { name: 'bood' });
});

test('useModal by component directly', async () => {
  let modal;
  const App = () => {
    modal = useModal(HocTestModal, { name: 'bood' });
    return <Provider />;
  };
  render(<App />);
  await testUseModal(modal);
});

test('show/hide modal by id with globally API', async () => {
  const hocTestModalId = 'hoc-test-modal';
  register(hocTestModalId, HocTestModal);
  render(<Provider />);
  let modalTextElement = screen.queryByText('HocTestModal');
  expect(modalTextElement).not.toBeInTheDocument();

  act(() => {
    NiceModal.show(hocTestModalId);
  });
  modalTextElement = screen.queryByText('HocTestModal');
  expect(modalTextElement).toBeInTheDocument();

  act(() => {
    NiceModal.hide(hocTestModalId);
  });
  modalTextElement = screen.queryByText('HocTestModal');
  expect(modalTextElement).toBeInTheDocument();

  await waitForElementToBeRemoved(() => screen.queryByText('HocTestModal'));
});

test('show/hide modal by component with globally API', async () => {
  const HocTestModal = create(({ name = 'nate' }) => {
    const modal = useModal();
    const remove = () => modal.remove();

    return (
      <TestModal visible={modal.visible} onExited={remove} onClose={remove}>
        <label>{name}</label>
        <div>HocTestModal</div>
      </TestModal>
    );
  });
  render(<Provider />);
  let modalTextElement = screen.queryByText('HocTestModal');
  expect(modalTextElement).not.toBeInTheDocument();

  act(() => {
    NiceModal.show(HocTestModal);
  });
  modalTextElement = screen.queryByText('HocTestModal');
  expect(modalTextElement).toBeInTheDocument();

  act(() => {
    NiceModal.hide(HocTestModal);
  });
  modalTextElement = screen.queryByText('HocTestModal');
  expect(modalTextElement).toBeInTheDocument();

  await waitForElementToBeRemoved(() => screen.queryByText('HocTestModal'));
});

test('hide an invalid id does nothing', () => {
  render(<Provider />);
  NiceModal.hide('abc');
});

test('dispatch invalid action does nothing', () => {
  const s1 = { p1: 'something' };
  const s2 = reducer(s1, { type: 'some-action' });
  expect(s1).toBe(s2);
});

test('useModal without context provider will throw exception', () => {
  console.error = () => null;
  render(
    <ErrorBoundary>
      <HocTestModal />
    </ErrorBoundary>,
  );
  expect(screen.queryByText('Something went wrong.')).toBeInTheDocument();
});

test('use invalid modal id only show warning msg.', () => {
  render(<Provider />);
  let warnMsg = null;
  console.warn = (msg) => (warnMsg = msg);
  act(() => {
    NiceModal.show('invalidid');
  });
  expect(warnMsg).toBe(
    'No modal found for id: invalidid. Please check the id or if it is registered or declared via JSX.',
  );
});

test('there is empty initial state', () => {
  const s = reducer(undefined, { type: 'some-action' });
  expect(s).toEqual({});
});

test('modal with defaultVisible prop', async () => {
  render(
    <Provider>
      <HocTestModal defaultVisible id="default-visible-modal" />
    </Provider>,
  );

  let modalTextElement = screen.queryByText('HocTestModal');
  expect(modalTextElement).toBeInTheDocument();

  act(() => {
    NiceModal.hide('default-visible-modal');
  });

  await waitForElementToBeRemoved(screen.queryByText('HocTestModal'));
});

test('modal with redux integration', async () => {
  const dispatch = () => null;
  const modals = {};
  const App = () => <Provider dispatch={dispatch} modals={modals} />;
  render(<App />);
});

const testHelper = async (Modal, helper, text, keepMounted = false) => {
  const HocModal = create(({ name }) => {
    const modal = useModal();
    return (
      <Modal {...helper(modal)}>
        <label>{name}</label>
      </Modal>
    );
  });

  render(
    <Provider>
      <HocModal keepMounted={keepMounted} id="helper-modal" name={text} />
    </Provider>,
  );

  let modalTextElement = screen.queryByText(text);
  if (keepMounted) {
    expect(modalTextElement).toBeInTheDocument();
  } else {
    expect(modalTextElement).not.toBeInTheDocument();
  }

  act(() => {
    NiceModal.show('helper-modal', { name: text });
  });

  modalTextElement = screen.queryByText(text);
  expect(modalTextElement).toBeInTheDocument();

  act(() => {
    fireEvent.click(screen.getByText('Close'));
  });
  modalTextElement = screen.queryByText(text);
  expect(modalTextElement).toBeInTheDocument();

  if (keepMounted) {
    await delay(50);
    expect(screen.queryByText(text)).toBeInTheDocument();
  } else {
    await waitForElementToBeRemoved(() => screen.queryByText(text));
  }
};
const AntdModal = ({ visible, onOk, onCancel, afterClose, children }) => {
  return (
    <TestModal visible={visible} onClose={onOk} onCancel={onCancel} onExited={afterClose}>
      {children}
    </TestModal>
  );
};
const AntdModalV5 = ({ open, onOk, onCancel, afterClose, children }) => {
  return (
    <TestModal visible={open} onClose={onOk} onCancel={onCancel} onExited={afterClose}>
      {children}
    </TestModal>
  );
};
test('test antd modal helper', async () => {
  await testHelper(AntdModalV5, antdModalV5, 'AntdModalV5');
  await testHelper(AntdModalV5, antdModalV5, 'AntdModalV5', true);
});
test('test antd modal v5 helper', async () => {
  await testHelper(AntdModalV5, antdModalV5, 'AntdModalV5');
  await testHelper(AntdModalV5, antdModalV5, 'AntdModalV5', true);
});

test('test antd modal onCancel', async () => {
  render(<Provider />);
  const HocAntModal2 = create(({ name }) => {
    const modal = useModal();
    return (
      <AntdModal {...antdModal(modal)}>
        <label>{name}</label>
      </AntdModal>
    );
  });
  act(() => {
    NiceModal.show(HocAntModal2, { name: 'HocAntModal2' });
  });
  fireEvent.click(screen.getByText('Cancel'));
  await waitForElementToBeRemoved(() => screen.queryByText('HocAntModal2'));
});

test('test antd drawer helper', async () => {
  const AntdDrawer = ({ visible, onClose, afterVisibleChange, children }) => {
    return (
      <TestModal visible={visible} onClose={onClose} onExited={() => afterVisibleChange(false)}>
        {children}
      </TestModal>
    );
  };
  await testHelper(AntdDrawer, antdDrawer, 'AntdDrawerTest');
});
test('test antd drawer v5 helper', async () => {
  const AntdDrawerV5 = ({ open, onClose, afterOpenChange, children }) => {
    return (
      <TestModal visible={open} onClose={onClose} onExited={() => afterOpenChange(false)}>
        {children}
      </TestModal>
    );
  };
  await testHelper(AntdDrawerV5, antdDrawerV5, 'AntdDrawerV5Test');
});

test('test mui dialog helper', async () => {
  const MuiDialog = ({ open, onClose, onExited, children }) => {
    return (
      <TestModal visible={open} onClose={onClose} onExited={onExited}>
        {children}
      </TestModal>
    );
  };
  await testHelper(MuiDialog, muiDialog, 'MuiDialogTest');
});

test('test mui v5 dialog helper', async () => {
  const MuiDialog = ({ open, onClose, TransitionProps: { onExited }, children }) => {
    return (
      <TestModal visible={open} onClose={onClose} onExited={onExited}>
        {children}
      </TestModal>
    );
  };
  await testHelper(MuiDialog, muiDialogV5, 'MuiDialogTest');
});

test('test bootstrap dialog helper', async () => {
  const BootstrapDialog = ({ show, onHide, onExited, children }) => {
    return (
      <TestModal visible={show} onClose={onHide} onExited={onExited}>
        {children}
      </TestModal>
    );
  };
  await testHelper(BootstrapDialog, bootstrapDialog, 'BootstrapDialogTest');
});
