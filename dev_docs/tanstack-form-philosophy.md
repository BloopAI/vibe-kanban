---
id: philosophy
title: Philosophy
---

Every well-established project should have a philosophy that guides its development. Without a core philosophy, development can languish in endless decision-making and have weaker APIs as a result.

This document outlines the core principles that drive the development and feature-set of TanStack Form.

## Upgrading unified APIs

APIs come with tradeoffs. As a result, it can be tempting to make each set of tradeoffs available to the user through different APIs. However, this can lead to a fragmented API that is harder to learn and use.

While this may mean a higher learning curve, it means that you don't have to question which API to use internally or have higher cognitive overhead when switching between APIs.

## Forms need flexibility

TanStack Form is designed to be flexible and customizable. While many forms may conform to similar patterns, there are always exceptions; especially when forms are a core component of your application.

As a result, TanStack Form supports multiple methods for validation:

- **Timing customizations**: You can validate on blur, change, submit, or even on mount.
- **Validation strategies**: You can validate on individual fields, the entire form, or a subset of fields.
- **Custom validation logic**: You can write your own validation logic or use a library like [Zod](https://zod.dev/) or [Valibot](https://valibot.dev/).
- **Custom error messages**: You can customize the error messages for each field by returning any object from a validator.
- **Async validation**: You can validate fields asynchronously and have common utils like debouncing and cancellation handled for you.

## Controlled is Cool

In a world where controlled vs uncontrolled inputs are a hot topic, TanStack Form is firmly in the controlled camp.

This comes with a number of advantages:

- **Predictable**: You can predict the state of your form at any point in time.
- **Easier testing**: You can easily test your forms by passing in values and asserting on the output.
- **Non-DOM support**: You can use TanStack Form with React Native, Three.js framework adapters, or any other framework renderer.
- **Enhanced conditional logic**: You can easily conditionally show/hide fields based on the form state.
- **Debugging**: You can easily log the form state to the console to debug issues.

## Generics are grim

You should never need to pass a generic or use an internal type when leveraging TanStack Form. This is because we've designed the library to infer everything from runtime defaults.

When writing sufficiently correct TanStack Form code, you should not be able to distinguish between JavaScript usage and TypeScript usage, with the exception of any type casts you might do of runtime values.

Instead of:

```typescript
useForm<MyForm>()
```

You should do:

```typescript
interface Person {
  name: string
  age: number
}

const defaultPerson: Person = { name: 'Bill Luo', age: 24 }

useForm({
  defaultValues: defaultPerson,
})
```

## Libraries are liberating

One of the main objectives of TanStack Form is that you should be wrapping it into your own component system or design system.

To support this, we have a number of utilities that make it easier to build your own components and customized hooks:

```typescript
// Exported from your own library with pre-bound components for your forms.
export const { useAppForm, withForm } = createFormHook(/* options */)
```

Without doing so, you're adding substantially more boilerplate to your apps and making your forms less consistent and user-friendly.
