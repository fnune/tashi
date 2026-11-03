import { type FocusEvent, useState } from "react";

export function useFocusVisible<K>() {
  const [focused, setFocused] = useState<K | null>(null);
  return {
    isFocusVisible: (key: K) => focused === key,
    focusHandlers: (key: K) => ({
      onFocus: (e: FocusEvent<HTMLElement>) =>
        setFocused(e.currentTarget.matches(":focus-visible") ? key : null),
      onBlur: () => setFocused((current) => (current === key ? null : current)),
    }),
  };
}

export function flag(on: boolean): "" | undefined {
  return on ? "" : undefined;
}
