import { ImageResponse } from "next/og";
import { OgCard } from "@/components/og-card";
import { getPublicPublication } from "@/lib/public-data";

export const alt = "Publication preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const publication = await getPublicPublication(slug);
  return new ImageResponse(
    <OgCard
      publication={publication?.name ?? "Postmeadow"}
      title={publication?.name ?? "Not found"}
      subtitle={publication?.description}
      accent={publication?.accentColor}
    />,
    size,
  );
}
