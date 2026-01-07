import * as _radix_ui_react_context from '@radix-ui/react-context';
import React from 'react';
import { Primitive } from '@radix-ui/react-primitive';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';

type Direction = 'ltr' | 'rtl';
declare const createAccordionScope: _radix_ui_react_context.CreateScope;
interface AccordionSingleProps extends AccordionImplSingleProps {
    type: 'single';
}
interface AccordionMultipleProps extends AccordionImplMultipleProps {
    type: 'multiple';
}
declare const Accordion: React.ForwardRefExoticComponent<(AccordionSingleProps | AccordionMultipleProps) & React.RefAttributes<HTMLDivElement>>;
interface AccordionImplSingleProps extends AccordionImplProps {
    /**
     * The controlled stateful value of the accordion item whose content is expanded.
     */
    value?: string;
    /**
     * The value of the item whose content is expanded when the accordion is initially rendered. Use
     * `defaultValue` if you do not need to control the state of an accordion.
     */
    defaultValue?: string;
    /**
     * The callback that fires when the state of the accordion changes.
     */
    onValueChange?(value: string): void;
    /**
     * Whether an accordion item can be collapsed after it has been opened.
     * @default false
     */
    collapsible?: boolean;
}
interface AccordionImplMultipleProps extends AccordionImplProps {
    /**
     * The controlled stateful value of the accordion items whose contents are expanded.
     */
    value?: string[];
    /**
     * The value of the items whose contents are expanded when the accordion is initially rendered. Use
     * `defaultValue` if you do not need to control the state of an accordion.
     */
    defaultValue?: string[];
    /**
     * The callback that fires when the state of the accordion changes.
     */
    onValueChange?(value: string[]): void;
}
type PrimitiveDivProps = React.ComponentPropsWithoutRef<typeof Primitive.div>;
interface AccordionImplProps extends PrimitiveDivProps {
    /**
     * Whether or not an accordion is disabled from user interaction.
     *
     * @defaultValue false
     */
    disabled?: boolean;
    /**
     * The layout in which the Accordion operates.
     * @default vertical
     */
    orientation?: React.AriaAttributes['aria-orientation'];
    /**
     * The language read direction.
     */
    dir?: Direction;
}
type CollapsibleProps = React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Root>;
interface AccordionItemProps extends Omit<CollapsibleProps, 'open' | 'defaultOpen' | 'onOpenChange'> {
    /**
     * Whether or not an accordion item is disabled from user interaction.
     *
     * @defaultValue false
     */
    disabled?: boolean;
    /**
     * A string value for the accordion item. All items within an accordion should use a unique value.
     */
    value: string;
}
/**
 * `AccordionItem` contains all of the parts of a collapsible section inside of an `Accordion`.
 */
declare const AccordionItem: React.ForwardRefExoticComponent<AccordionItemProps & React.RefAttributes<HTMLDivElement>>;
type PrimitiveHeading3Props = React.ComponentPropsWithoutRef<typeof Primitive.h3>;
interface AccordionHeaderProps extends PrimitiveHeading3Props {
}
/**
 * `AccordionHeader` contains the content for the parts of an `AccordionItem` that will be visible
 * whether or not its content is collapsed.
 */
declare const AccordionHeader: React.ForwardRefExoticComponent<AccordionHeaderProps & React.RefAttributes<HTMLHeadingElement>>;
type CollapsibleTriggerProps = React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger>;
interface AccordionTriggerProps extends CollapsibleTriggerProps {
}
/**
 * `AccordionTrigger` is the trigger that toggles the collapsed state of an `AccordionItem`. It
 * should always be nested inside of an `AccordionHeader`.
 */
declare const AccordionTrigger: React.ForwardRefExoticComponent<AccordionTriggerProps & React.RefAttributes<HTMLButtonElement>>;
type CollapsibleContentProps = React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>;
interface AccordionContentProps extends CollapsibleContentProps {
}
/**
 * `AccordionContent` contains the collapsible content for an `AccordionItem`.
 */
declare const AccordionContent: React.ForwardRefExoticComponent<AccordionContentProps & React.RefAttributes<HTMLDivElement>>;
declare const Root: React.ForwardRefExoticComponent<(AccordionSingleProps | AccordionMultipleProps) & React.RefAttributes<HTMLDivElement>>;
declare const Item: React.ForwardRefExoticComponent<AccordionItemProps & React.RefAttributes<HTMLDivElement>>;
declare const Header: React.ForwardRefExoticComponent<AccordionHeaderProps & React.RefAttributes<HTMLHeadingElement>>;
declare const Trigger: React.ForwardRefExoticComponent<AccordionTriggerProps & React.RefAttributes<HTMLButtonElement>>;
declare const Content: React.ForwardRefExoticComponent<AccordionContentProps & React.RefAttributes<HTMLDivElement>>;

export { Accordion, AccordionContent, type AccordionContentProps, AccordionHeader, type AccordionHeaderProps, AccordionItem, type AccordionItemProps, type AccordionMultipleProps, type AccordionSingleProps, AccordionTrigger, type AccordionTriggerProps, Content, Header, Item, Root, Trigger, createAccordionScope };
