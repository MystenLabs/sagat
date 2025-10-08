export interface Tab {
	id: string;
	label: string;
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
						className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
							activeTab === tab.id
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						}`}
					>
						{tab.label}
						{tab.count !== undefined && tab.count > 0 && (
							<span
								className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
									tab.countColor === 'orange'
										? 'bg-orange-100 text-orange-600'
										: tab.countColor === 'gray'
											? 'bg-gray-100 text-gray-600'
											: 'bg-blue-100 text-blue-600'
								}`}
							>
								{tab.count}
							</span>
						)}
					</button>
				))}
			</div>
		</div>
	);
}
