import type { Metadata } from "next";
import { ReviewApp } from "@/components/review/ReviewApp";

export const metadata: Metadata = { title: "MapPal · Review" };

// Swipe through the places the agent found, per person; or see them on a map.
export default function ReviewPage() {
  return <ReviewApp />;
}
