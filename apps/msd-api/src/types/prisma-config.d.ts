declare module "prisma/config" {
  export interface PrismaConfigOptions {
    schema?: string;
    migrations?: {
      path?: string;
    };
    datasource?: {
      url?: string;
    };
  }

  export function defineConfig(config: PrismaConfigOptions): PrismaConfigOptions;
  export function env(name: string): string;
}
