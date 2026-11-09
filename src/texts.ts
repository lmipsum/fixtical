// Every text the calendars, their page and the notifications show: they are in Hungarian.

/** The language of these texts, and of the annotation labels picked for the events. */
export const LANGUAGE = "hu";

/** Texts of the events. */
export const FEED = {
  stale: (date: string) => `A naptár nem frissült ${date} óta`,
  /** The match's page, named in the description. */
  matchPage: (url: string) => `Adatlap: ${url}`,
};

/** Texts of the page listing the calendars. */
export const PAGE = {
  title: "Meccsnaptárak",
  intro: "Iratkozz fel egy naptárra: a meccsek és a változások maguktól frissülnek a naptáradban.",
  apple: "Feliratkozás – iPhone / Mac",
  google: "Feliratkozás – Google Naptár",
  address: "Cím más naptárhoz:",
  /** The page switcher's label, and the list of the pages without scripts. */
  team: "Csapat:",
  file: "Naptárfájl",
  /** Section headings by source, futsal apart from football. */
  sections: {
    mlsz: "Labdarúgás – MLSZ adatbank",
    "mlsz-futsal": "Futsal – MLSZ adatbank",
    mvlsz: "Vízilabda – MVLSZ adatbank",
    mrsz: "Röplabda – MRSZ",
  } as Record<string, string>,
};

/** Texts of the notifications. */
export const NOTIFY = {
  failing: (error: string) => `Nem frissül (${error}); a korábbi menetrend marad kint.`,
  recovered: "Újra frissül.",
  test: "Teszt értesítés: a naptár értesítései ide érkeznek.",
};
