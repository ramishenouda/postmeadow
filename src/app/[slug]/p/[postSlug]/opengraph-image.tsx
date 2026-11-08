import { ImageResponse } from "next/og";
import { OgCard } from "@/components/og-card";
import { getPublicPublication, getPublishedPost } from "@/lib/public-data";

export const alt = "Post preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; postSlug: string }>;
}) {
  const { slug, postSlug } = await params;
  const [publication, post] = await Promise.all([
    getPublicPublication(slug),
    getPublishedPost(slug, postSlug),
  ]);
  return new ImageResponse(
    <OgCard
      publication={publication?.name ?? "Postmeadow"}
      title={post?.title ?? "Not found"}
      subtitle={post?.subtitle}
      accent={publication?.accentColor}
    />,
    size,
  );
}
