# Winnow

Single-page marketing site. Next.js 15 (App Router), Tailwind CSS v4, motion, Lenis.

```sh
npm ci
npm run dev      # http://localhost:3000
npm run build
```

## Deploy

The app lives in `winnow/`. From this directory:

```sh
npx vercel@63.1.2 --prod
```

or import the repository in Vercel with **Root Directory** set to `winnow`.

## Notes

- `motion` is pinned to 12.40.0. From 12.41 its `motion/react` entry re-exports
  through a namespace import that keeps the full `motion` component (every
  animation feature) in the bundle, which pushes first-load JS past budget.
- The hero field lives in `lib/field.ts`: everything is precomputed in
  `createField()`, and `renderField()` only interpolates from scroll progress.
