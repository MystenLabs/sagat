import { Label } from './label';

export interface Tab {
	id: string;
	label: string;
	icon?: React.ReactNode;
	count?: number;
	countColor?: 'blue' | 'orange' | 'gray';
}

interface TabsProps {
	tabs: Tab[];
	activeTab: string;
	onTabChange: (tabId: string) => void;
}

export function Tabs({
	tabs,
	activeTab,
	onTabChange,
}: TabsProps) {
	return (
		<div className="border-b">
			<div className="flex space-x-8">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						onClick={() => onTabChange(tab.id)}
						className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
							activeTab === tab.id
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						}`}
					>
						{tab.icon}
						{tab.label}
						{tab.count !== undefined && tab.count > 0 && (
							<Label
								variant={
									tab.countColor === 'orange'
										? 'warning'
										: tab.countColor === 'gray'
											? 'neutral'
											: 'info'
								}
								size="sm"
								className="ml-2"
							>
								{tab.count}
							</Label>
						)}
					</button>
				))}
			</div>
		</div>
	);
}
