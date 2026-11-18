import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tavola",
    short_name: "Tavola",
    description: "Sign up for shared meals and split the groceries.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f2ea",
    theme_color: "#d1491c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
