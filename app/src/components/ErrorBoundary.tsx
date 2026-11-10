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
				? { hasError: false, error: undefined }
				: {}),
		};
	}

	componentDidCatch(error: unknown, info: ErrorInfo) {
		this.props.onError?.(error, info);
	}

	reset = () => {
		this.setState({ hasError: false, error: undefined });
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
