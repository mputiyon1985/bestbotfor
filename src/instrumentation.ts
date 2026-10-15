export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installCatalogPathGuard } = await import('./lib/catalog-path-guard')
    installCatalogPathGuard()
  }
}
