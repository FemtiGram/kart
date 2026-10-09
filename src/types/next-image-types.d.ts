// CI runs `tsc --noEmit` straight after `npm ci`, without a `next build` or
// `next dev` first, so the generated (git-ignored) next-env.d.ts is absent
// there and static image imports (`import art from "@/assets/thumbs/x.webp"`)
// fail with TS2307. Reference Next's image module declarations explicitly;
// when next-env.d.ts does exist, the same file is included twice, which
// TypeScript dedupes.
/// <reference types="next/image-types/global" />
