"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback: ReactNode;
  /** Named in the console so a render failure is attributable to one panel. */
  label: string;
  /** Changing this clears a previous failure, so a panel recovers on the next refresh. */
  resetKey?: string | number;
};

type State = { failed: boolean; resetKey?: string | number };

/**
 * Isolates one dashboard panel's render failures from the rest of the page.
 *
 * The forecast pipeline already isolates provider and spot failures so one
 * outage cannot erase healthy breaks. Rendering had no equivalent: a throw in
 * the map or the trend chart unmounted the whole dashboard, taking the live
 * forecast down with it.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { failed: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    if (props.resetKey === state.resetKey) return null;
    return { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown) {
    console.error(`[dashboard] ${this.props.label} failed to render:`, error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
