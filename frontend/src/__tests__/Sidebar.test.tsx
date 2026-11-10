import { folioFor } from '@/lib/nav/toc'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '../components/layout/Sidebar'
import i18n from '../i18n'
import { FILMS_LIVE, STORIES_LIVE } from '@/lib/constants'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null, logout: vi.fn() }),
}))

// Ensure English for test assertions
beforeAll(async () => {
  await i18n.changeLanguage('en')
})

function renderSidebar(props: { collapsed?: boolean; onToggle?: () => void } = {}, path = '/', analyzed?: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  if (analyzed !== undefined) queryClient.setQueryData(['data-quality'], { analyzed_contracts: analyzed })
  const defaultProps = { collapsed: false, onToggle: vi.fn(), ...props }
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <TooltipProvider>
          <Sidebar {...defaultProps} />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Sidebar', () => {
  it('renders numbered rows when expanded', () => {
    renderSidebar({ collapsed: false })
    expect(screen.getByText('Sectors')).toBeInTheDocument()
    expect(screen.getByText('Sexenios')).toBeInTheDocument()
  })

  it('renders brand text when expanded', () => {
    renderSidebar({ collapsed: false })
    expect(screen.getByText('RUBLI')).toBeInTheDocument()
  })

  it('renders the four section heads when expanded', () => {
    renderSidebar({ collapsed: false })
    for (const h of ['THE STORY', 'THE MONEY', 'INVESTIGATE', 'TRANSPARENCY']) {
      expect(screen.getByText(h)).toBeInTheDocument()
    }
    expect(screen.queryByText('FRONT PAGE')).not.toBeInTheDocument()
  })

  it('renders every group’s rows', () => {
    renderSidebar({ collapsed: false })
    for (const name of ['Red Flags', 'Cases', ...(FILMS_LIVE ? ['Screening room'] : []), 'The Archive', 'Methodology', 'Press']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it.runIf(STORIES_LIVE)('numbers the Portada as row I and keeps Newsroom as an index link', () => {
    renderSidebar({ collapsed: false })
    const index = screen.getByRole('navigation', { name: 'Index' })
    for (const [name, href] of [['Newsroom', '/journalists']]) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(index).toContainElement(link)
    }
  })

  it('calls onToggle when collapse button is clicked', () => {
    const onToggle = vi.fn()
    renderSidebar({ onToggle })
    const toggleButton = screen.getByRole('button', { name: /collapse sidebar/i })
    fireEvent.click(toggleButton)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('hides brand text and the index links when collapsed', () => {
    renderSidebar({ collapsed: true })
    expect(screen.queryByText('RUBLI')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Index' })).not.toBeInTheDocument()
  })

  it('hides section headers when collapsed', () => {
    renderSidebar({ collapsed: true })
    expect(screen.queryByText('THE STORY')).not.toBeInTheDocument()
    expect(screen.queryByText('THE MONEY')).not.toBeInTheDocument()
  })

  it('shows expand sidebar label when collapsed', () => {
    renderSidebar({ collapsed: true })
    const toggleButton = screen.getByRole('button', { name: /expand sidebar/i })
    expect(toggleButton).toBeInTheDocument()
  })

  it('numbers every row from the registry and marks the active one', () => {
    renderSidebar({ collapsed: false }, '/institutions/3')
    const link = screen.getByRole('link', { name: new RegExp(`${folioFor('/institutions')} · Institutions`) })
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link).toHaveAttribute('href', '/institutions')
    expect(screen.getByRole('link', { name: new RegExp(`${folioFor('/press')} · Press`) })).toBeInTheDocument()
  })

  it('shows the footer count only once the data-quality query has it', () => {
    renderSidebar({ collapsed: false })
    expect(screen.queryByText(/contracts with a valid amount/)).not.toBeInTheDocument()
    renderSidebar({ collapsed: false }, '/', 3055837)
    expect(screen.getByText('3,055,837 contracts with a valid amount')).toBeInTheDocument()
  })

  it('collapses to a numeral spine', () => {
    renderSidebar({ collapsed: true })
    expect(screen.getByRole('link', { name: `${folioFor('/aria')} · Red Flags` })).toHaveTextContent(folioFor('/aria')!)
    expect(screen.queryByText('Red Flags')).not.toBeInTheDocument()
  })
})
