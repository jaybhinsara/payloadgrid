import type { Metadata } from "next";

type PublicMetadataInput = {
  title: string;
  description: string;
  path: string;
};

export function publicMetadata({ title, description, path }: PublicMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: "PayloadGrid",
      title,
      description
    },
    twitter: {
      card: "summary_large_image",
      title,
      description
    }
  };
}
