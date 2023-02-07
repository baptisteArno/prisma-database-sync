<p align="center">
  <a href="https://typebot.io/#gh-light-mode-only" target="_blank">
    <img src="./.github/images/illustration-light.png"
    width="500px" alt="Readme illustration">
  </a>
  <a href="https://typebot.io/#gh-dark-mode-only" target="_blank">
    <img src="./.github/images/illustration-dark.png"
    width="500px" alt="Readme illustration">
  </a>
  <h1 align="center">Prisma Databases Sync</h1>
</p>

## Features

- Sync data from and to any database (PostgreSQL, MySQL, MongoDB etc...) as long as it is supported by Prisma
- Incremental sync, based on date fileds. To avoid dumping all the data every time.
- Migrate your production database without downtime

## Get started

1. Clone the repository
2. Run `pnpm install`
3. Copy `.env.example` to `.env` and fill it with your database URLs
4. Edit `src/source.prisma` and `src/target.prisma` with your schemas. Make sure it contains:

   ```
   generator utils {
     provider = "pnpm tsx src/generatePrismaUtilsTypes.ts"
     output   = "prisma-clients/target"
   }
   ```

5.
