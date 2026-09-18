import { notFound } from "next/navigation";
import { MerchantPurchasePreview } from "./preview";

export default function MerchantPurchasePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return <MerchantPurchasePreview />;
}
