interface CategoryHeroProps {
  eyebrow: string;
  title: string;
  intro: string;
}

/**
 * Top section of a category landing page (/energi, /natur, /samfunn).
 * Eyebrow ("DATAKART · Energi") + big title + ~80-word editorial intro.
 */
export function CategoryHero({ eyebrow, title, intro }: CategoryHeroProps) {
  return (
    <div className="container mx-auto px-6 md:px-16 pt-10 md:pt-16 pb-8 md:pb-12 max-w-4xl">
      <p
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
        aria-hidden="true"
      >
        {eyebrow}
      </p>
      <h1
        className="mt-2 text-4xl md:text-5xl font-extrabold tracking-tight"
        style={{ color: "var(--kv-blue)" }}
      >
        {title}
      </h1>
      <p className="mt-5 text-base md:text-lg text-foreground/85 leading-relaxed max-w-2xl">
        {intro}
      </p>
    </div>
  );
}
