// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	Component,
	type ErrorInfo,
	type ReactNode,
} from 'react';

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback: (props: {
		error: unknown;
		reset: () => void;
	}) => ReactNode;
	onError?: (error: unknown, info: ErrorInfo) => void;
	/** A change clears a crash, e.g. the pathname on navigation. */
	resetKey?: unknown;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: unknown;
	resetKey: unknown;
	/** Bumped whenever a crash is cleared. */
	crash: number;
}

/** Catches render errors below it and shows `fallback` instead. */
export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	state: ErrorBoundaryState = {
		hasError: false,
		error: undefined,
		resetKey: this.props.resetKey,
		crash: 0,
	};

	static getDerivedStateFromError(
		error: unknown,
	): Partial<ErrorBoundaryState> {
		return { hasError: true, error };
	}

	static getDerivedStateFromProps(
		props: ErrorBoundaryProps,
		state: ErrorBoundaryState,
	): Partial<ErrorBoundaryState> | null {
		if (Object.is(props.resetKey, state.resetKey))
			return null;
		return {
			resetKey: props.resetKey,
			...(state.hasError
				? {
						hasError: false,
						error: undefined,
						crash: state.crash + 1,
					}
				: {}),
		};
	}

	// React can hand one failed render several errors.
	private reportedCrash: number | undefined;

	componentDidCatch(error: unknown, info: ErrorInfo) {
		if (this.reportedCrash === this.state.crash) return;
		this.reportedCrash = this.state.crash;
		this.props.onError?.(error, info);
	}

	reset = () => {
		this.setState((state) => ({
			hasError: false,
			error: undefined,
			crash: state.crash + 1,
		}));
	};

	render() {
		if (this.state.hasError)
			return this.props.fallback({
				error: this.state.error,
				reset: this.reset,
			});
		return this.props.children;
	}
}
