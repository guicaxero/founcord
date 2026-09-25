import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { areaBySlug, areas } from "@/components/admin/areas";

export const dynamicParams = false;

export function generateStaticParams() {
  return areas.map((area) => ({ area: area.slug }));
}

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ area: string }> }>): Promise<Metadata> {
  const area = areaBySlug((await params).area);
  return area ? { title: area.label, description: area.description } : {};
}

export default async function DashboardAreaPage({
  params,
}: Readonly<{ params: Promise<{ area: string }> }>) {
  if (!areaBySlug((await params).area)) notFound();
  return null;
}
