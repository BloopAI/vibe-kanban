/**
 * @typedef {import('react').DialogHTMLAttributes} DialogHTMLAttributes
 * @typedef {import('react').HTMLAttributes} HTMLAttributes
 * @typedef {import('react').MouseEvent<HTMLElement, MouseEvent>} ReactMouseEvent}
 * @typedef {import('./types').ContextMenuProps} Props
 */

import {
  arrow,
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingOverlay,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from '@floating-ui/react-dom-interactions'
import { html } from 'htm/react'
import * as React from 'react'
import mergeRefs from 'react-merge-refs'

import { getDisplayNameForInstance } from './getDisplayNameFromReactInstance.js'
import { getPathToSource } from './getPathToSource.js'
import { getPropsForInstance } from './getPropsForInstance.js'
import { getReactInstancesForElement } from './getReactInstancesForElement.js'
import { getSourceForInstance } from './getSourceForInstance.js'

// @ts-expect-error
export const ContextMenu = React.forwardRef((props, ref) => {
  // @ts-expect-error
  const { onClose, pathModifier } = props

  const [target, setTarget] = React.useState(
    /** @type {HTMLElement | null} */
    (null)
  )

  const arrowRef = React.useRef(
    /** @type {HTMLElement | null} */
    (null)
  )

  const [activeIndex, setActiveIndex] = React.useState(
    /** @type {number | null} */
    (null)
  )

  const [open, setOpen] = React.useState(false)

  const listItemsRef = React.useRef(
    /** @type {Array<HTMLButtonElement | null>} */
    ([])
  )

  const {
    x,
    y,
    reference,
    floating,
    strategy,
    refs,
    update,
    context,
    placement,
    middlewareData: { arrow: { x: arrowX, y: arrowY } = {} },
  } = useFloating({
    open,
    onOpenChange(open) {
      setOpen(open)

      if (!open) onClose?.()
    },
    middleware: [
      offset({ mainAxis: 5, alignmentAxis: 4 }),
      flip(),
      shift(),
      arrow({ element: arrowRef }),
    ],
    placement: 'right',
  })

  const { getFloatingProps, getItemProps } = useInteractions([
    useRole(context, { role: 'menu' }),
    useDismiss(context),
    useListNavigation(context, {
      listRef: listItemsRef,
      activeIndex,
      onNavigate: setActiveIndex,
      focusItemOnOpen: false,
    }),
  ])

  React.useEffect(() => {
    if (open && refs.reference.current && refs.floating.current) {
      return autoUpdate(refs.reference.current, refs.floating.current, update)
    }
  }, [open, update, refs.reference, refs.floating])

  const mergedReferenceRef = React.useMemo(
    () => mergeRefs([ref, reference]),
    [reference, ref]
  )

  React.useEffect(() => {
    function onContextMenu(
      /** @type {MouseEvent} */
      e
    ) {
      if (!e.altKey) {
        return
      }

      e.preventDefault()
      mergedReferenceRef({
        getBoundingClientRect() {
          return {
            x: e.clientX,
            y: e.clientY,
            width: 0,
            height: 0,
            top: e.clientY,
            right: e.clientX,
            bottom: e.clientY,
            left: e.clientX,
          }
        },
      })

      setOpen(true)

      if (e.target instanceof HTMLElement) setTarget(e.target)
    }

    document.addEventListener('contextmenu', onContextMenu)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
    }
  }, [mergedReferenceRef])

  React.useLayoutEffect(() => {
    if (open) {
      refs.floating.current?.focus()
    }
  }, [open, refs.floating])

  React.useLayoutEffect(() => {
    if (!arrowRef.current) return

    const staticSide = {
      top: 'bottom',
      right: 'left',
      bottom: 'top',
      left: 'right',
    }[placement.split('-')[0]]

    Object.assign(arrowRef.current.style, {
      display: 'block',
      left: arrowX != null ? `${arrowX}px` : '',
      top: arrowY != null ? `${arrowY}px` : '',
      right: '',
      bottom: '',
      [staticSide]: '-4px',
    })
  }, [arrowX, arrowY, placement])

  if (!target) {
    return null
  }

  const instances = getReactInstancesForElement(target).filter((instance) =>
    getSourceForInstance(instance)
  )

  return html`
    <style key="click-to-component-contextmenu-style">
      #floating-ui-root > div {
        z-index: 2147483647;
      }

      [data-click-to-component-contextmenu],
      [data-click-to-component-contextmenu] * {
        box-sizing: border-box !important;
      }

      [data-click-to-component-contextmenu] {
        all: unset;
        outline: 0;
        background: white;
        color: black;
        font-weight: bold;
        overflow: visible;
        padding: 5px;
        font-size: 13px;
        border-radius: 6px;
        border: none;

        --shadow-color: 0deg 0% 0%;
        --shadow-elevation-low: 0px -1px 0.8px hsl(var(--shadow-color) / 0.1),
          0px -1.2px 0.9px -2.5px hsl(var(--shadow-color) / 0.07),
          0px -3px 2.3px -5px hsl(var(--shadow-color) / 0.03);

        --shadow-elevation-medium: 0px 1px 0.8px hsl(var(--shadow-color) / 0.11),
          0px 1.5px 1.1px -1.7px hsl(var(--shadow-color) / 0.08),
          0px 5.1px 3.8px -3.3px hsl(var(--shadow-color) / 0.05),
          0px 15px 11.3px -5px hsl(var(--shadow-color) / 0.03);
        --shadow-elevation-high: 0px 1px 0.8px hsl(var(--shadow-color) / 0.1),
          0px 1.1px 0.8px -0.7px hsl(var(--shadow-color) / 0.09),
          0px 2.1px 1.6px -1.4px hsl(var(--shadow-color) / 0.07),
          0px 4.9px 3.7px -2.1px hsl(var(--shadow-color) / 0.06),
          0px 10.1px 7.6px -2.9px hsl(var(--shadow-color) / 0.05),
          0px 18.9px 14.2px -3.6px hsl(var(--shadow-color) / 0.04),
          0px 31.9px 23.9px -4.3px hsl(var(--shadow-color) / 0.02),
          0px 50px 37.5px -5px hsl(var(--shadow-color) / 0.01);

        box-shadow: var(--shadow-elevation-high);
        filter: drop-shadow(0px 0px 0.5px rgba(0 0 0 / 50%));
      }

      [data-click-to-component-contextmenu] button {
        all: unset;
        outline: 0;
        display: flex;
        flex-direction: column;
        width: 100%;
        padding: 5px;
        border-radius: 4px;
        font-size: 13px;
        max-width: 50vw;
      }

      [data-click-to-component-contextmenu] button:focus,
      [data-click-to-component-contextmenu] button:not([disabled]):active {
        cursor: pointer;
        background: royalblue;
        color: white;
        box-shadow: var(--shadow-elevation-medium);
      }

      [data-click-to-component-contextmenu] button:focus code,
      [data-click-to-component-contextmenu] button:not([disabled]):active code {
        color: white;
      }

      [data-click-to-component-contextmenu] button > * + * {
        margin-top: 3px;
      }

      [data-click-to-component-contextmenu] button code {
        color: royalblue;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          'Liberation Mono', 'Courier New', monospace;
      }

      [data-click-to-component-contextmenu] button code var {
        background: rgba(0 0 0 / 5%);
        cursor: help;
        border-radius: 3px;
        padding: 3px 6px;
        font-style: normal;
        font-weight: normal;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif,
          'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
          'Noto Color Emoji';
      }

      [data-click-to-component-contextmenu] button cite {
        font-weight: normal;
        font-style: normal;
        font-size: 11px;
        opacity: 0.5;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          'Liberation Mono', 'Courier New', monospace;
      }

      [data-click-to-component-contextmenu] button cite data::after {
        content: attr(value);
        float: right;
        padding-left: 15px;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif,
          'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
          'Noto Color Emoji';
      }

      [data-click-to-component-contextmenu-arrow] {
        display: none;
        position: absolute;
        background: inherit;
        width: 8px;
        height: 8px;
        transform: rotate(45deg);
      }
    </style>

    ${open &&
    html`
        <${FloatingOverlay} key="click-to-component-overlay" lockScroll>
          <${FloatingFocusManager} context=${context}>
            <dialog
              ...${getFloatingProps({
                ref: floating,
                style: {
                  position: strategy,
                  top: y ?? '',
                  left: x ?? '',
                },
              })}
              data-click-to-component-contextmenu
              onClose=${function handleClose(event) {
                // @ts-ignore Property 'returnValue' does not exist on type 'HTMLElement'.ts(2339)
                onClose(refs.floating.current.returnValue)
                setOpen(false)
              }}
              open
            >
              <form method="dialog">
                ${instances.map((instance, i) => {
                  const name = getDisplayNameForInstance(instance)
                  const source = getSourceForInstance(instance)
                  const path = getPathToSource(source, pathModifier)
                  const props = getPropsForInstance(instance)

                  return html`
                    <button
                      ...${getItemProps({
                        role: 'menuitem',
                        ref(
                          /** @type {HTMLButtonElement} */
                          node
                        ) {
                          listItemsRef.current[i] = node
                        },
                      })}
                      key=${i}
                      name="path"
                      type="submit"
                      value=${path}
                    >
                      <code>
                        ${'<'}${name}
                        ${Object.entries(props).map(
                          ([prop, value]) => html`
                            ${' '}
                            <var key=${prop} title="${value}">${prop}</var>
                          `
                        )}
                        ${'>'}
                      </code>
                      <cite>
                        <data
                          value="${source.lineNumber}:${source.columnNumber}"
                        >
                          ${source.fileName.replace(/.*(src|pages)/, '$1')}
                        </data>
                      </cite>
                    </button>
                  `
                })}
              </form>

              <div
                data-click-to-component-contextmenu-arrow
                ref=${arrowRef}
              />
            </dialog>
          </${FloatingFocusManager}>
        </${FloatingOverlay}>
      `}
  `
})
