# Web Scrapper

A small TypeScript-based web scraping starter that uses Playwright and Express.

**Prerequisites**
- Node.js 18+ and npm

**Install**

```bash
npm install
```

**Type-check**

```bash
npx tsc --noEmit
```

**Run (development)**

```bash
npm run dev
```

This project uses `type: "module"` in `package.json`. When compiling to ESM with TypeScript (moduleResolution `node16`/`nodenext`) keep these points in mind:

- Relative ECMAScript imports must include explicit file extensions (for example, use `import { readFileData } from "./utils.js"` instead of `"./utils"`).
- The `dev` script uses `tsx` to run TypeScript files directly.
- Use this url to trigger the scrapper: localhost:3000/scrapper

**Files of interest**

- `src/scrapper.ts` - Express entry / example usage
- `src/utils.ts` - scraping helpers (Playwright)
- `skus.json` - sample SKUs used by the scrapper

If you want, I can also add a `build`/`start` script, example environment configuration, or basic tests.

**Assumptions made during development.**
-   Retrying three times if one sku failed and adding it to the failed list instead of trying failed sku list
-   Using streams to write to CSV file if having high throghput or data
-   Assuming this code will be run locally. So did not created build tool for this

**Limitations of the solution.**
- Build tool is not implemented
- Unit tests are not implemented
