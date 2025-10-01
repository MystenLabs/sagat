import { useState, useMemo, useEffect, useRef } from "react";
import { Users, ChevronDown, Search, AlertTriangle } from "lucide-react";
import { formatAddress } from "../lib/formatters";
import { MultisigWithMembersForPublicKey } from "@/lib/types";

interface MultisigSelectorProps {
  multisigs: MultisigWithMembersForPublicKey[];
  selectedMultisig: string;
  onSelectMultisig: (address: string) => void;
}

export function MultisigSelector({
  multisigs,
  selectedMultisig,
  onSelectMultisig,
}: MultisigSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter multisigs based on search query
  const filteredMultisigs = useMemo(
    () =>
      multisigs.filter(
        (m) =>
          (m.name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
          m.address.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [multisigs, searchQuery],
  );

  const currentMultisig = multisigs.find((m) => m.address === selectedMultisig);

  if (!currentMultisig) {
    return null;
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
        setSearchQuery(""); // Clear search when closing dropdown
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (multisigs.length === 1) {
    // Single multisig - no dropdown needed
    return (
      <div className="flex items-center space-x-4">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold">
              {currentMultisig?.name || "Unnamed Multisig"}
            </h2>
            <p className="text-sm text-gray-500">
              {currentMultisig?.threshold}/{currentMultisig?.totalMembers}{" "}
              threshold • {formatAddress(currentMultisig?.address || "")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Multiple multisigs - show dropdown
  return (
    <div className="relative flex-1" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center justify-between w-full max-w-lg px-4 py-2 text-left bg-gray-50 border rounded-lg hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <div className="font-medium">
              {currentMultisig?.name || "Select Multisig"}
              {currentMultisig.pendingMembers ? (
                <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                  {currentMultisig.pendingMembers} pending member
                  {currentMultisig.pendingMembers > 1 ? "s" : ""}
                </span>
              ) : null}
              {currentMultisig.rejectedMembers > 0 ? (
                <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                  {currentMultisig.rejectedMembers} rejected member
                  {currentMultisig.rejectedMembers > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-gray-500">
              {currentMultisig?.threshold} threshold •{" "}
              {currentMultisig?.totalMembers} members •{" "}
              {formatAddress(currentMultisig?.address || "")}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${showDropdown ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div className="absolute top-full mt-2 w-full max-w-lg bg-white border rounded-lg shadow-lg z-10">
          <div className="p-2">
            {/* Search Input */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <p className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">
              {filteredMultisigs.length === multisigs.length
                ? "Select Multisig"
                : `${filteredMultisigs.length} of ${multisigs.length} multisigs`}
            </p>

            {filteredMultisigs.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                No multisigs found matching "{searchQuery}"
              </div>
            ) : (
              filteredMultisigs.map((multisig) => (
                <button
                  key={multisig.address}
                  onClick={() => {
                    onSelectMultisig(multisig.address);
                    setShowDropdown(false);
                    setSearchQuery(""); // Clear search when selecting
                  }}
                  className={`w-full px-3 py-2 text-left rounded-md hover:bg-gray-50 transition-colors ${
                    multisig.address === selectedMultisig ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                        <Users className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium">
                          {multisig.name || "Unnamed Multisig"}
                        </div>
                        <p className="text-xs text-gray-500">
                          {formatAddress(multisig.address)} •{" "}
                          {multisig.threshold} out of {multisig.totalWeight}{" "}
                          weight threshold
                        </p>
                      </div>
                    </div>
                    {multisig.pendingMembers > 0 && (
                      <span className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded-full">
                        <AlertTriangle className="w-4 h-4 text-orange-700" />
                      </span>
                    )}
                    {multisig.rejectedMembers > 0 && (
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">
                        <AlertTriangle className="w-4 h-4 text-red-700" />
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
