import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BestBotFor',
    short_name: 'BestBotFor',
    description: 'Three questions. One best bot.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f1e7',
    theme_color: '#1b4332',
  }
}
