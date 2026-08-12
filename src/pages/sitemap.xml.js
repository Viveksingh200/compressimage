const pages = [
  "",
  "compress-to-50kb",
  "compress-to-100kb",
  "compress-to-200kb",
  "compress-to-500kb",
  "compress-to-1mb",
  "compress-jpg",
  "compress-png",
  "compress-webp",
  "compress-avif",
  "bulk-image-compressor",
  "zip-image-compressor",
  "image-resizer",
  "image-format-converter",
  "faq"
];

const siteUrl = "https://onlinecompressimage.com";

export async function GET() {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${siteUrl}/${page}${page ? '/' : ''}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${page === "" ? "1.0" : "0.8"}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
