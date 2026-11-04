import { SubmitButton } from "./user-submit-button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "ui/radio-group";
import { Label } from "ui/label";
import { BasicUserWithLastLogin } from "app-types/user";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { updateUserTierAction } from "@/app/api/admin/actions";
import { UpdateUserTierActionState } from "@/app/api/admin/validations";
import Form from "next/form";
import { useTranslations } from "next-intl";
import {
  SubscriptionTierName,
  subscriptionTiersInfo,
  normalizeSubscriptionTier,
} from "app-types/subscription";

export function UserTierSelector({
  children,
  user,
  onTierChange,
  open,
  onOpenChange,
}: {
  children?: React.ReactNode;
  user: Pick<BasicUserWithLastLogin, "id" | "name" | "tier">;
  onTierChange: (updatedUser: Pick<BasicUserWithLastLogin, "tier">) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const tCommon = useTranslations("Common");
  const [showTierDialog, setShowTierDialog] = useState(false);
  const selectedTier = normalizeSubscriptionTier(user.tier);

  const [_, tierFormAction, isPending] = useActionState<
    UpdateUserTierActionState,
    FormData
  >(async (_prevState, formData) => {
    const result = await updateUserTierAction({}, formData);
    if (result?.success && result.user) {
      onTierChange({ tier: result.user.tier });
      if (onOpenChange) {
        onOpenChange(false);
      } else {
        setShowTierDialog(false);
      }
      toast.success(result?.message || "Subscription tier updated");
    } else {
      toast.error(result?.message || "Failed to update subscription tier");
    }
    return result;
  }, {});

  const isOpen = open !== undefined ? open : showTierDialog;
  const handleOpenChange = onOpenChange || setShowTierDialog;

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      {children && <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
      <AlertDialogContent>
        <Form action={tierFormAction}>
          <input type="hidden" name="userId" value={user.id} />

          <AlertDialogHeader>
            <AlertDialogTitle>Change Subscription Tier</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a tier for {user.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="my-4 max-h-[55vh] overflow-y-auto space-y-3 pr-1">
            <RadioGroup
              name="tier"
              defaultValue={selectedTier}
              onValueChange={(value) => {
                onTierChange({ tier: value as SubscriptionTierName });
              }}
            >
              {Object.entries(subscriptionTiersInfo).map(([tier, info]) => (
                <div key={tier} className="flex items-start space-x-3">
                  <RadioGroupItem
                    value={tier}
                    id={tier}
                    disabled={isPending}
                    className="data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                    data-testid={`tier-radio-${tier}`}
                  />
                  <div className="leading-none flex flex-col w-full">
                    <Label htmlFor={tier} className="flex flex-col w-full">
                      <span className="w-full text-sm font-medium text-start">
                        {info.label}
                      </span>
                      <span className="w-full text-xs text-muted-foreground text-start">
                        INR {info.pricePerMonthInr.toLocaleString("en-IN")}
                        /month
                      </span>
                      <span className="w-full text-xs text-muted-foreground text-start">
                        {info.description}
                      </span>
                    </Label>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-6">
            <AlertDialogCancel
              disabled={isPending}
              type="button"
              onClick={() => handleOpenChange(false)}
            >
              {tCommon("cancel")}
            </AlertDialogCancel>
            <SubmitButton>Update Tier</SubmitButton>
          </div>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
