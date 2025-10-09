import { type ReactNode, useEffect } from 'react';

interface ModalProps {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
	size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
	sm: 'max-w-sm',
	md: 'max-w-md',
	lg: 'max-w-lg',
};

export function Modal({
	open,
	onClose,
	children,
	size = 'md',
}: ModalProps) {
	useEffect(() => {
		if (!open) return;

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};

		document.addEventListener('keydown', handleEscape);
		return () => document.removeEventListener('keydown', handleEscape);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div
			className="fixed inset-1 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
			onClick={onClose}
		>
			<div
				className={`bg-white rounded-lg p-6 w-full mx-4 ${sizeClasses[size]}`}
				onClick={(e) => e.stopPropagation()}
			>
				{children}
			</div>
		</div>
	);
}

interface ModalHeaderProps {
	icon?: ReactNode;
	title: string;
}

export function ModalHeader({
	icon,
	title,
}: ModalHeaderProps) {
	return (
		<div className="flex items-center gap-3 mb-4">
			{icon}
			<h2 className="text-lg font-semibold">{title}</h2>
		</div>
	);
}

export function ModalContent({
	children,
}: {
	children: ReactNode;
}) {
	return <div className="space-y-3 mb-6">{children}</div>;
}

export function ModalActions({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="flex gap-3 justify-end">{children}</div>
	);
}

export function ModalWarning({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
			<p className="text-sm text-amber-800">{children}</p>
		</div>
	);
}
