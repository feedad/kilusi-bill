'use client'

import React, { forwardRef } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { Input } from './input'
import { useDebounceSearch } from '@/hooks/useDebounceSearch'

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  placeholder?: string
  delay?: number
  onSearch?: (query: string) => void
  className?: string
  showClearButton?: boolean
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ placeholder = 'Cari...', delay = 500, onSearch, className, showClearButton = true, ...props }, ref) => {
    const { searchInput, setSearchInput, clearSearch, isSearching } = useDebounceSearch({
      delay,
      onSearch,
    })

    const handleClear = () => {
      clearSearch()
      const inputElement = ref as React.RefObject<HTMLInputElement>
      if (inputElement?.current) {
        inputElement.current.focus()
      }
    }

    return (
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={ref}
          type="text"
          placeholder={placeholder}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={`pl-10 pr-10 ${className || ''}`}
          {...props}
        />
        {isSearching && (
          <Loader2 className="absolute right-10 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
        {showClearButton && searchInput && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }
)

SearchInput.displayName = 'SearchInput'

export const InlineSearch = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ placeholder = 'Cari...', delay = 300, className, ...props }, ref) => {
    const { searchInput, setSearchInput, isSearching } = useDebounceSearch({
      delay,
    })

    return (
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={ref}
          type="text"
          placeholder={placeholder}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={`pl-10 ${className || ''}`}
          {...props}
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>
    )
  })

InlineSearch.displayName = 'InlineSearch'
