import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Link, useNavigate } from "react-router-dom";
import { MemberInput } from "./multisig/MemberInput";
import { CustomWalletButton } from "./CustomWalletButton";
import { MultisigPageFAQ } from "./faqs/MultisigPageFAQ";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useCreateMultisig } from "../hooks/useCreateMultisig";
import {
  createMultisigSchema,
  type CreateMultisigForm,
  type Member,
} from "../lib/validations/multisig";
import { computeMultisigAddress } from "../lib/sui-utils";
import { useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useApiAuth } from "@/contexts/ApiAuthContext";

export function CreateMultisigPage() {
  const currentAccount = useCurrentAccount();
  const createMultisig = useCreateMultisig();
  const { currentAddress } = useApiAuth();

  const navigate = useNavigate();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Initialize form with React Hook Form
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateMultisigForm>({
    resolver: zodResolver(createMultisigSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      members: [
        {
          id: "creator",
          publicKey: "", // Will be filled when we have current account
          weight: 1,
          isCreator: true,
        },
      ],
      threshold: 1,
    },
  });

  const members = watch("members");
  const threshold = watch("threshold");
  const totalWeight = members.reduce((sum, m) => sum + m.weight, 0);

  // Set creator's public key when current account is available
  useEffect(() => {
    if (
      currentAccount &&
      members[0]?.isCreator &&
      !members[0]?.publicKey &&
      currentAddress
    ) {
      handleMemberChange("creator", { publicKey: currentAddress.publicKey });
    }
  }, [currentAccount, members]);

  // Check if all members have valid public keys and we have at least 2 members
  const allMembersValid = members.every((m) => m.publicKey && !m.error);
  const hasMinimumMembers = members.length >= 2;

  // Compute multisig address preview
  const multisigPreview = computeMultisigAddress(
    members.map((m) => m.publicKey),
    members.map((m) => m.weight),
    threshold,
  );

  const canSubmit = allMembersValid && hasMinimumMembers && !multisigPreview.error;

  const handleMemberChange = (id: string, updates: Partial<Member>) => {
    const newMembers = members.map((m) =>
      m.id === id ? { ...m, ...updates } : m,
    );
    setValue("members", newMembers);
  };

  const handleMemberRemove = (id: string) => {
    setValue(
      "members",
      members.filter((m) => m.id !== id),
    );
  };

  const handleAddMember = () => {
    if (members.length < 10) {
      setValue("members", [
        ...members,
        {
          id: Date.now().toString(),
          publicKey: "",
          weight: 1,
        },
      ]);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = members.findIndex((m) => m.id === active.id);
      const newIndex = members.findIndex((m) => m.id === over.id);

      const newMembers = arrayMove(members, oldIndex, newIndex);
      setValue("members", newMembers);
    }
  };

  const onSubmit = (data: CreateMultisigForm) => {
    createMultisig.mutate(data);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-screen">
        {/* Left Side - FAQ Section */}
        <div className="bg-slate-50 p-6 lg:p-8 lg:col-span-4 overflow-y-auto">
          <div className="max-w-md mx-auto lg:max-w-none">
            <Link
              to="/"
              className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
            <div className="mb-6 mt-6">
              <h1 className="text-3xl font-bold text-slate-900 mb-4">
                Create New Multisig
              </h1>
              <p className="text-slate-600 mt-12">
                Learn about multisig wallets and how to set them up securely.
              </p>
            </div>

            <MultisigPageFAQ />

            <CustomWalletButton variant="sidebar" disableAccountSwitching />
          </div>
        </div>

        {/* Right Side - Registration Form */}
        <div className="p-6 lg:p-8 lg:col-span-8 overflow-y-auto">
          <div className="max-w-lg mx-auto lg:max-w-none">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Multisig Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Multisig Name
                </label>
                <Input
                  {...register("name")}
                  placeholder="e.g., Team Treasury, Personal Vault"
                  maxLength={255}
                />
                {errors.name && (
                  <p className="text-sm text-red-500 mt-1">
                    {errors.name.message}
                  </p>
                )}
              </div>

              {/* Members */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium">
                    Members ({members.length}/10)
                  </label>
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={members.map((m) => m.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {members.map((member, index) => (
                        <MemberInput
                          key={member.id}
                          member={member}
                          index={index}
                          canRemove={members.length > 2}
                          onChange={handleMemberChange}
                          onRemove={handleMemberRemove}
                        />
                      ))}
                      {members.length < 10 && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={handleAddMember}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Another Member
                        </Button>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
                {errors.members && (
                  <p className="text-sm text-red-500 mt-2">
                    {errors.members.message}
                  </p>
                )}
              </div>

              {/* Threshold */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Approval Threshold
                </label>
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    {...register("threshold", { valueAsNumber: true })}
                    className="w-24"
                    min={1}
                    max={totalWeight}
                  />
                  <span className="text-sm text-gray-600">
                    out of {totalWeight} total weight
                  </span>
                </div>
                {errors.threshold && (
                  <p className="text-sm text-red-500 mt-1">
                    {errors.threshold.message}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  Number of weighted votes required to execute transactions
                </p>
              </div>

              {/* Multisig Address Preview */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Multisig Address Preview
                </label>
                <div className="p-3 bg-gray-50 rounded-lg">
                  {multisigPreview.address ? (
                    <div>
                      <p className="text-sm font-mono text-gray-800 break-all">
                        {multisigPreview.address}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        ✓ Live preview based on current configuration
                      </p>
                    </div>
                  ) : <p className="text-sm text-gray-500">Cannot compute multisig address</p>}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  This address will be used to receive funds and execute
                  transactions
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={createMultisig.isPending}
                  onClick={() => navigate("/")}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMultisig.isPending || !canSubmit}
                >
                  {createMultisig.isPending ? "Creating..." : "Create Multisig"}
                </Button>
              </div>
              {multisigPreview.error && (
                <div className="text-sm text-red-500 mt-2">
                  {multisigPreview.error}
                </div>
              )}
              {!canSubmit && (
                <div className="text-sm text-amber-600 mt-2">
                  {!hasMinimumMembers && (
                    <p>
                      A multisig requires at least 2 members. Please add another
                      member.
                    </p>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
