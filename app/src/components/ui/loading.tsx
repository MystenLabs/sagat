import { cn } from '../../lib/utils';

interface LoadingProps {
	message?: string;
	size?: 'sm' | 'md' | 'lg';
	fullScreen?: boolean;
	className?: string;
}

export function Loading({
	message = 'Loading...',
	size = 'md',
	fullScreen = true,
	className,
}: LoadingProps) {
	const sizeClasses = {
		sm: 'h-8 w-8 border-2',
		md: 'h-12 w-12 border-b-2',
		lg: 'h-16 w-16 border-b-3',
	};

	const containerClasses = fullScreen
		? 'flex flex-col items-center justify-center min-h-[60vh]'
		: 'flex flex-col items-center justify-center';

	return (
		<div className={cn(containerClasses, className)}>
			<div
				className={cn(
					'animate-spin rounded-full border-blue-600',
					sizeClasses[size],
				)}
			/>
			{message && (
				<p className="mt-4 text-gray-600">{message}</p>
			)}
		</div>
	);
}

// Inline loading for buttons or small areas
export function InlineLoading({
	message = 'Loading...',
}: {
	message?: string;
}) {
	return (
		<span className="inline-flex items-center gap-2">
			<span className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
			{message && (
				<span className="text-sm">{message}</span>
			)}
		</span>
	);
}
